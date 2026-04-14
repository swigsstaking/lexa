import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { query } from "../db/postgres.js";
import type {
  CompanyInfo,
  FilledForm,
  TvaFormTemplate,
  TvaProjection,
  VatRateCode,
} from "./types.js";
import { quarterRange } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Template embed dans le backend. Source canonique versionnée dans
// 01-knowledge-base/forms/ — la copie est synchronisée au déploiement.
const TEMPLATE_PATH = resolve(
  __dirname,
  "./templates/tva-afc-decompte-effectif-2024.yaml",
);

let cachedTemplate: TvaFormTemplate | null = null;

async function loadTemplate(): Promise<TvaFormTemplate> {
  if (cachedTemplate) return cachedTemplate;
  const raw = await readFile(TEMPLATE_PATH, "utf-8");
  cachedTemplate = parseYaml(raw) as TvaFormTemplate;
  return cachedTemplate;
}

function rateCodeFor(rate: number): VatRateCode | null {
  if (Math.abs(rate - 8.1) < 0.05) return "standard";
  if (Math.abs(rate - 2.6) < 0.05) return "reduced";
  if (Math.abs(rate - 3.8) < 0.05) return "lodging";
  return null;
}

type ProjectionRow = {
  line_type: "debit" | "credit";
  account: string;
  tva_rate: string;
  amount_ht: string;
  amount_ttc: string;
};

async function getCompany(tenantId: string): Promise<CompanyInfo> {
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
    // pas avoir d'entrée en DB. On émet une company minimale pour que le
    // builder reste utilisable — le PDF affichera "—" pour les champs vides.
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

function emptyProjection(): TvaProjection {
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

async function projectTva(
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
  const seenEvents = new Set<string>();

  for (const row of result.rows) {
    const line = row.line_type;
    const account = row.account ?? "";
    const rate = Number(row.tva_rate);
    const amountHt = Number(row.amount_ht);
    const amountTtc = Number(row.amount_ttc);
    const tva = amountTtc - amountHt;
    const code = rateCodeFor(rate);

    // line_type='credit' sur compte produit (3xxx) = vente TVA collectée
    if (line === "credit" && account.startsWith("3")) {
      if (code) {
        projection.caHt[code] += amountHt;
        projection.caTtc[code] += amountTtc;
        projection.tvaDue[code] += tva;
      } else if (rate === 0) {
        projection.caExonere += amountHt;
      }
      seenEvents.add(account + rate);
    }

    // line_type='debit' sur compte charge (4xxx–8xxx) avec TVA = impôt préalable
    if (
      line === "debit" &&
      account.length > 0 &&
      "45678".includes(account[0] ?? "") &&
      rate > 0
    ) {
      projection.impotPrealable.operating += tva;
    }
  }

  projection.eventCount = result.rows.length / 2;

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

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function buildDecompteTva(params: {
  tenantId: string;
  quarter: 1 | 2 | 3 | 4;
  year: number;
  method?: "effective" | "tdfn";
}): Promise<FilledForm> {
  const { tenantId, quarter, year, method = "effective" } = params;
  const template = await loadTemplate();
  const company = await getCompany(tenantId);
  const { start, end } = quarterRange(quarter, year);
  const projection = await projectTva(tenantId, start, end);

  return {
    formId: template.form_id,
    version: template.version,
    method,
    period: { quarter, year, start, end },
    company,
    projection,
    template,
    generatedAt: new Date().toISOString(),
  };
}
