import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { query } from "../db/postgres.js";
import type {
  CompanyInfo,
  TvaFormTemplate,
  TvaProjection,
  VatRateCode,
} from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Charge un template YAML depuis `src/execution/templates/`. Cache par chemin
 * pour éviter les relectures répétées. Source canonique dans
 * `01-knowledge-base/forms/`, copie embed synchronisée au déploiement.
 */
const templateCache = new Map<string, TvaFormTemplate>();

export async function loadTemplate(filename: string): Promise<TvaFormTemplate> {
  const cached = templateCache.get(filename);
  if (cached) return cached;
  const path = resolve(__dirname, "./templates/", filename);
  const raw = await readFile(path, "utf-8");
  const parsed = parseYaml(raw) as TvaFormTemplate;
  templateCache.set(filename, parsed);
  return parsed;
}

export function rateCodeFor(rate: number): VatRateCode | null {
  if (Math.abs(rate - 8.1) < 0.05) return "standard";
  if (Math.abs(rate - 2.6) < 0.05) return "reduced";
  if (Math.abs(rate - 3.8) < 0.05) return "lodging";
  return null;
}

export async function getCompany(tenantId: string): Promise<CompanyInfo> {
  const result = await query<{
    tenant_id: string;
    uid: string | null;
    name: string;
    vat_number: string | null;
    canton: string | null;
    legal_form: string;
  }>(
    `SELECT tenant_id, uid, name, vat_number, canton, legal_form
     FROM companies WHERE tenant_id = $1`,
    [tenantId],
  );
  const row = result.rows[0];
  if (!row) {
    // Tenants historiques créés avant la migration 003_companies peuvent ne
    // pas avoir d'entrée en DB. Fallback gracieux — PDF/XML afficheront "—".
    return {
      tenantId,
      uid: null,
      name: `Tenant ${tenantId.slice(0, 8)}`,
      vatNumber: null,
      canton: null,
      legalForm: "unknown",
    };
  }
  return {
    tenantId: row.tenant_id,
    uid: row.uid,
    name: row.name,
    vatNumber: row.vat_number,
    canton: row.canton,
    legalForm: row.legal_form,
  };
}

export function emptyProjection(): TvaProjection {
  return {
    caHt: { standard: 0, reduced: 0, lodging: 0 },
    caTtc: { standard: 0, reduced: 0, lodging: 0 },
    tvaDue: { standard: 0, reduced: 0, lodging: 0, total: 0 },
    impotPrealable: { operating: 0, capex: 0, total: 0 },
    solde: 0,
    caExonere: 0,
    eventCount: 0,
  };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

type ProjectionRow = {
  line_type: "debit" | "credit";
  account: string;
  tva_rate: string;
  amount_ht: string;
  amount_ttc: string;
};

/**
 * Projette les events TransactionClassified d'un tenant sur la période
 * donnée (inclusif) via la materialized view ledger_entries. Retourne une
 * TvaProjection agrégée par taux avec CA HT/TTC, TVA due, impôt préalable
 * et solde signé.
 *
 * Convention :
 * - line_type='credit' sur compte produit (3xxx) → vente imposable
 * - line_type='debit' sur compte charge (4-8xxx) avec rate>0 → impôt préalable
 */
export async function projectTva(
  tenantId: string,
  start: string,
  end: string,
): Promise<TvaProjection> {
  const result = await query<ProjectionRow>(
    `SELECT line_type, account, tva_rate::text, amount_ht::text, amount_ttc::text
     FROM ledger_entries
     WHERE tenant_id = $1
       AND transaction_date BETWEEN $2::date AND $3::date`,
    [tenantId, start, end],
  );

  const projection = emptyProjection();

  for (const row of result.rows) {
    const line = row.line_type;
    const account = row.account ?? "";
    const rate = Number(row.tva_rate);
    const amountHt = Number(row.amount_ht);
    const amountTtc = Number(row.amount_ttc);
    const tva = amountTtc - amountHt;
    const code = rateCodeFor(rate);

    if (line === "credit" && account.startsWith("3")) {
      if (code) {
        projection.caHt[code] += amountHt;
        projection.caTtc[code] += amountTtc;
        projection.tvaDue[code] += tva;
      } else if (rate === 0) {
        projection.caExonere += amountHt;
      }
    }

    if (
      line === "debit" &&
      account.length > 0 &&
      "45678".includes(account[0] ?? "") &&
      rate > 0
    ) {
      projection.impotPrealable.operating += tva;
    }
  }

  projection.eventCount = Math.floor(result.rows.length / 2);

  projection.tvaDue.total = round2(
    projection.tvaDue.standard + projection.tvaDue.reduced + projection.tvaDue.lodging,
  );
  projection.impotPrealable.operating = round2(projection.impotPrealable.operating);
  projection.impotPrealable.total = round2(
    projection.impotPrealable.operating + projection.impotPrealable.capex,
  );
  projection.solde = round2(projection.tvaDue.total - projection.impotPrealable.total);
  (["standard", "reduced", "lodging"] as const).forEach((k) => {
    projection.caHt[k] = round2(projection.caHt[k]);
    projection.caTtc[k] = round2(projection.caTtc[k]);
    projection.tvaDue[k] = round2(projection.tvaDue[k]);
  });
  projection.caExonere = round2(projection.caExonere);

  return projection;
}
