import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { query } from "../db/postgres.js";
import { getCompany, round2 } from "./shared.js";
import type {
  CompanyInfo,
  FilledVsPpForm,
  VsPpFormTemplate,
  VsPpProjection,
} from "./types.js";
import { annualRange } from "./types.js";

const TEMPLATE_FILE = "vs-declaration-pp-2024.yaml";
const __dirname = dirname(fileURLToPath(import.meta.url));

let cachedTemplate: VsPpFormTemplate | null = null;

async function loadVsPpTemplate(): Promise<VsPpFormTemplate> {
  if (cachedTemplate) return cachedTemplate;
  const path = resolve(__dirname, "./templates/", TEMPLATE_FILE);
  const raw = await readFile(path, "utf-8");
  cachedTemplate = parseYaml(raw) as VsPpFormTemplate;
  return cachedTemplate;
}

type AccountSumRow = {
  account: string;
  total_debit: string;
  total_credit: string;
};

/**
 * Projection comptable → champs fiscaux PP VS.
 *
 * v1 : mapping simplifié depuis le grand livre Käfer.
 *
 *   revenuIndependant = Σ crédit produits (3xxx) − Σ débit charges (4-8xxx)
 *     (bénéfice net de l'exploitation individuelle)
 *
 *   fortuneNette = Σ solde débit actif (1xxx) − Σ solde crédit passif (2xxx)
 *     (approximation : solde cumulé au 31/12 de l'année)
 *
 *   fraisProForfait = min(max(revenu × 3%, 2000), 4000)
 *     (forfait frais pro salariés 2024 Valais)
 *
 * Les champs `revenu_salaire`, `pilier_3a`, `lpp_rachats`, `primes_assurances`
 * et `interets_dette` sont marqués TODO dans le template et devront être
 * complétés manuellement par l'utilisateur jusqu'à ce qu'on ajoute un
 * onboarding personnel (session 14+).
 */
async function projectVsPp(
  tenantId: string,
  year: number,
  refAmounts: VsPpFormTemplate["reference_amounts"],
): Promise<VsPpProjection> {
  const { start, end } = annualRange(year);

  // 1) Revenu d'activité indépendante : produits − charges sur l'année
  const incomeResult = await query<{
    class: string;
    total: string;
  }>(
    `SELECT
       CASE
         WHEN account LIKE '3%' THEN 'produit'
         WHEN account ~ '^[4-8]' THEN 'charge'
         ELSE 'other'
       END AS class,
       SUM(CASE
             WHEN account LIKE '3%' AND line_type = 'credit' THEN amount
             WHEN account ~ '^[4-8]' AND line_type = 'debit' THEN amount
             ELSE 0
           END)::text AS total
     FROM ledger_entries
     WHERE tenant_id = $1
       AND transaction_date BETWEEN $2::date AND $3::date
     GROUP BY class`,
    [tenantId, start, end],
  );

  let produits = 0;
  let charges = 0;
  for (const row of incomeResult.rows) {
    if (row.class === "produit") produits = Number(row.total);
    if (row.class === "charge") charges = Number(row.total);
  }
  const revenuIndependant = round2(produits - charges);

  // 2) Fortune nette : somme actifs (1xxx) - somme passifs (2xxx) au 31/12
  //    Approximation : solde cumulé de toutes les écritures <= end.
  const wealthResult = await query<AccountSumRow>(
    `SELECT account,
            SUM(CASE WHEN line_type = 'debit' THEN amount ELSE 0 END)::text  AS total_debit,
            SUM(CASE WHEN line_type = 'credit' THEN amount ELSE 0 END)::text AS total_credit
     FROM ledger_entries
     WHERE tenant_id = $1
       AND transaction_date <= $2::date
       AND (account LIKE '1%' OR account LIKE '2%')
     GROUP BY account`,
    [tenantId, end],
  );

  let fortuneNette = 0;
  for (const row of wealthResult.rows) {
    const debit = Number(row.total_debit);
    const credit = Number(row.total_credit);
    if (row.account.startsWith("1")) {
      fortuneNette += debit - credit;
    } else if (row.account.startsWith("2")) {
      fortuneNette -= credit - debit;
    }
  }
  fortuneNette = round2(fortuneNette);

  // 3) Frais professionnels forfaitaires (salariés VS 2024)
  const brut = Math.max(revenuIndependant, 0);
  const rawForfait = brut * (refAmounts.frais_professionnels_forfait_pct / 100);
  const fraisProForfait = round2(
    Math.min(
      Math.max(rawForfait, refAmounts.frais_professionnels_forfait_min_chf),
      refAmounts.frais_professionnels_forfait_max_chf,
    ),
  );

  const revenuTotal = revenuIndependant; // salaires + capital = TODO
  const deductionTotal = fraisProForfait;
  const revenuImposable = round2(revenuTotal - deductionTotal);

  return {
    revenuIndependant,
    revenuTotal,
    fortuneNette,
    fraisProForfait,
    deductionTotal,
    revenuImposable,
    eventCount: incomeResult.rows.length + wealthResult.rows.length,
  };
}

export async function buildVsPpDeclaration(params: {
  tenantId: string;
  year: number;
}): Promise<FilledVsPpForm> {
  const { tenantId, year } = params;
  const template = await loadVsPpTemplate();
  const company: CompanyInfo = await getCompany(tenantId);
  const projection = await projectVsPp(tenantId, year, template.reference_amounts);

  return {
    formId: template.form_id,
    version: template.version,
    year,
    company,
    projection,
    template,
    generatedAt: new Date().toISOString(),
  };
}
