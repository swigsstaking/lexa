import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { query } from "../db/postgres.js";
import { getCompany, loadTemplate, round2 } from "./shared.js";
import type { CompanyInfo, FilledForm, TvaFormTemplate, TvaProjection } from "./types.js";
import { annualRange, quarterRange } from "./types.js";

const TEMPLATE_FILE = "tva-afc-decompte-tdfn-2024.yaml";
const RATES_FILE = "tdfn-rates-2024.yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Rates YAML loader ─────────────────────────────────
export type TdfnRate = {
  code: string;
  label: string;
  rate: number;
  sector: string;
};

type TdfnRatesYaml = {
  version: string;
  authority: string;
  source_circular: string;
  source_qdrant_prefix: string;
  rates: TdfnRate[];
};

let cachedRates: TdfnRatesYaml | null = null;

export async function loadTdfnRates(): Promise<TdfnRatesYaml> {
  if (cachedRates) return cachedRates;
  const path = resolve(__dirname, "./templates/", RATES_FILE);
  const raw = await readFile(path, "utf-8");
  cachedRates = parseYaml(raw) as TdfnRatesYaml;
  return cachedRates;
}

export async function lookupTdfnRate(
  sectorCode: string | undefined,
): Promise<TdfnRate> {
  const rates = await loadTdfnRates();
  if (sectorCode) {
    const match = rates.rates.find((r) => r.code === sectorCode);
    if (match) return match;
  }
  // Fallback : secteur "autre"
  const autre = rates.rates.find((r) => r.code === "autre");
  if (!autre) throw new Error("tdfn-rates: missing 'autre' fallback entry");
  return autre;
}

// ── Projection TDFN ────────────────────────────────────
type TdfnProjectionRow = {
  amount_ttc: string;
  account: string;
  line_type: "debit" | "credit";
};

async function projectTdfn(
  tenantId: string,
  start: string,
  end: string,
  rate: TdfnRate,
): Promise<TvaProjection> {
  // Le CA TTC est la somme de toutes les lignes CRÉDIT sur comptes produits
  // (3xxx) dans la période. L'impôt préalable n'entre PAS en jeu dans TDFN.
  const result = await query<TdfnProjectionRow>(
    `SELECT amount_ttc::text, account, line_type
     FROM ledger_entries
     WHERE tenant_id = $1
       AND transaction_date BETWEEN $2::date AND $3::date
       AND line_type = 'credit'
       AND account LIKE '3%'`,
    [tenantId, start, end],
  );

  let caTtc = 0;
  for (const row of result.rows) {
    caTtc += Number(row.amount_ttc);
  }
  caTtc = round2(caTtc);
  const impotDu = round2((caTtc * rate.rate) / 100);

  // On utilise la structure TvaProjection existante avec un mapping
  // spécifique : `standard` porte le montant TDFN consolidé, les autres
  // taux restent à 0. Le renderer TDFN sait que c'est une TDFN via
  // form.method === 'tdfn' et reformate en conséquence.
  return {
    caHt: { standard: round2(caTtc - impotDu), reduced: 0, lodging: 0 },
    caTtc: { standard: caTtc, reduced: 0, lodging: 0 },
    tvaDue: {
      standard: impotDu,
      reduced: 0,
      lodging: 0,
      total: impotDu,
    },
    impotPrealable: { operating: 0, capex: 0, total: 0 },
    solde: impotDu,
    caExonere: 0,
    eventCount: result.rows.length,
  };
}

// ── Builder principal ──────────────────────────────────
export async function buildDecompteTdfn(params: {
  tenantId: string;
  year: number;
  quarter?: 1 | 2 | 3 | 4;
  sectorCode?: string;
}): Promise<FilledForm & { tdfnRate: TdfnRate }> {
  const { tenantId, year, quarter, sectorCode } = params;
  const template = (await loadTemplate(TEMPLATE_FILE)) as TvaFormTemplate;
  const company: CompanyInfo = await getCompany(tenantId);
  const rate = await lookupTdfnRate(sectorCode);

  const range = quarter ? quarterRange(quarter, year) : annualRange(year);
  const projection = await projectTdfn(tenantId, range.start, range.end, rate);

  return {
    formId: template.form_id,
    version: template.version,
    method: "tdfn",
    period: quarter
      ? { kind: "quarterly", quarter, year, start: range.start, end: range.end }
      : { kind: "annual", year, start: range.start, end: range.end },
    company,
    projection,
    template,
    generatedAt: new Date().toISOString(),
    tdfnRate: rate,
  };
}
