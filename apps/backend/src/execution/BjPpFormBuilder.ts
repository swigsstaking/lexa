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
import type { TaxpayerDraftState } from "../taxpayers/schema.js";
import { estimateTaxDue } from "./taxEstimator.js";

// ── Constantes Jura bernois 2026 ─────────────────────────────────────────────
// BJ = communes francophones du canton de Berne (Jura bernois + Biel/Bienne)
// Pilier 3a 2026 : avec LPP = 7'260 CHF, sans LPP = 36'288 CHF (identique fédéral)
const BJ_PILIER_3A_WITH_LPP = 7260;
const BJ_PILIER_3A_WITHOUT_LPP = 36288;

// Forfait frais professionnels BE/BJ — fallback 3% min 1'700 / max 3'400 CHF
// TODO : confirmer barème ADB (OFP-BE RSB 661.312)
const BJ_FRAIS_PRO_FORFAIT_MIN = 1700;
const BJ_FRAIS_PRO_FORFAIT_MAX = 3400;
const BJ_FRAIS_PRO_FORFAIT_PCT = 3;

export const BJ_CONSTANTS = {
  BJ_PILIER_3A_WITH_LPP,
  BJ_PILIER_3A_WITHOUT_LPP,
  BJ_FRAIS_PRO_FORFAIT_MIN,
  BJ_FRAIS_PRO_FORFAIT_MAX,
  BJ_FRAIS_PRO_FORFAIT_PCT,
} as const;

const TEMPLATE_FILE = "bj-declaration-pp-2026.yaml";
const __dirname = dirname(fileURLToPath(import.meta.url));

let cachedTemplate: VsPpFormTemplate | null = null;

async function loadBjPpTemplate(): Promise<VsPpFormTemplate> {
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
 * Projection fiscale PP Jura bernois (canton de Berne, section francophone).
 *
 * Clone de FrPpFormBuilder — adapté aux spécificités du Jura bernois :
 * - Forfait frais pro min = 1'700 CHF, max = 3'400 CHF (3%) — fallback conservateur
 * - Pilier 3a salarié max = 7'260 CHF (avec LPP), 36'288 CHF (sans LPP) — 2026
 * - PAS de coefficient communal
 * - Autorité : ADB section francophone (Administration fiscale du canton de Berne)
 */
async function projectFromLedger(
  tenantId: string,
  year: number,
): Promise<{ revenuIndependant: number; fortuneNette: number; eventCount: number }> {
  const { start, end } = annualRange(year);

  const incomeResult = await query<{ class: string; total: string }>(
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

  return {
    revenuIndependant,
    fortuneNette: round2(fortuneNette),
    eventCount: incomeResult.rows.length + wealthResult.rows.length,
  };
}

function computeFraisProBj(
  salaireBrut: number,
  format?: "forfait" | "reel",
  fraisReels?: number,
): number {
  if (format === "reel" && fraisReels !== undefined) {
    return round2(fraisReels);
  }
  const base = Math.max(salaireBrut, 0);
  const rawForfait = base * (BJ_FRAIS_PRO_FORFAIT_PCT / 100);
  return round2(
    Math.min(
      Math.max(rawForfait, BJ_FRAIS_PRO_FORFAIT_MIN),
      BJ_FRAIS_PRO_FORFAIT_MAX,
    ),
  );
}

async function projectBjPp(params: {
  tenantId: string;
  year: number;
  refAmounts: VsPpFormTemplate["reference_amounts"];
  draft?: TaxpayerDraftState;
}): Promise<VsPpProjection> {
  const { tenantId, year, draft } = params;
  const hasDraft =
    !!draft &&
    (Object.keys(draft.step1 ?? {}).length > 0 ||
      Object.keys(draft.step2 ?? {}).length > 0 ||
      Object.keys(draft.step3 ?? {}).length > 0 ||
      Object.keys(draft.step4 ?? {}).length > 0);

  const ledger = await projectFromLedger(tenantId, year);

  const step2 = draft?.step2 ?? {};
  const step3 = draft?.step3 ?? {};
  const step4 = draft?.step4 ?? {};

  const revenuSalaire = round2(step2.salaireBrut ?? 0);
  const revenuAccessoires = round2(step2.revenusAccessoires ?? 0);
  const revenuRentes = round2(
    (step2.rentesAvs ?? 0) + (step2.rentesLpp ?? 0) + (step2.rentes3ePilier ?? 0),
  );
  const revenuCapital = round2(step2.revenusTitres ?? 0);
  const revenuImmobilier = round2(step2.revenusImmobiliers ?? 0);
  const revenuIndependant = hasDraft
    ? round2(revenuAccessoires)
    : ledger.revenuIndependant;

  const revenuTotal = round2(
    revenuSalaire +
      revenuIndependant +
      revenuRentes +
      revenuCapital +
      revenuImmobilier,
  );

  const fortuneBrute = round2(
    (step3.comptesBancaires ?? 0) +
      (step3.titresCotes ?? 0) +
      (step3.titresNonCotes ?? 0) +
      (step3.immeublesValeurFiscale ?? 0) +
      (step3.vehicules ?? 0) +
      (step3.autresBiens ?? 0),
  );
  const fortuneDettes = round2(
    (step3.immeublesEmprunt ?? 0) + (step3.dettes ?? 0),
  );
  const fortuneNette = hasDraft
    ? round2(fortuneBrute - fortuneDettes)
    : ledger.fortuneNette;

  const deductionPilier3a = round2(step4.pilier3a ?? 0);
  const deductionLppRachats = round2(step4.rachatsLpp ?? 0);
  const deductionPrimes = round2(step4.primesAssurance ?? 0);
  const deductionInterets = round2(step4.interetsPassifs ?? 0);
  const deductionFraisMedicaux = round2(step4.fraisMedicaux ?? 0);
  const deductionDons = round2(step4.dons ?? 0);

  const deductionFraisPro = computeFraisProBj(
    revenuSalaire + revenuIndependant,
    step4.fraisProFormat,
    step4.fraisProReels,
  );

  const deductionTotal = round2(
    deductionPilier3a +
      deductionLppRachats +
      deductionPrimes +
      deductionInterets +
      deductionFraisPro +
      deductionFraisMedicaux +
      deductionDons,
  );

  const revenuImposable = round2(revenuTotal - deductionTotal);

  const source: VsPpProjection["source"] = hasDraft
    ? step2.revenusAccessoires !== undefined && ledger.revenuIndependant !== 0
      ? "mixed"
      : "draft"
    : "ledger";

  // BJ n'est pas encore dans taxEstimator — fallback FR (structure similaire)
  const taxEstimate = revenuImposable > 0
    ? estimateTaxDue({
        canton: "FR",
        year,
        revenuImposable,
        civilStatus: (draft?.step1?.civilStatus === "married" || draft?.step1?.civilStatus === "registered_partnership")
          ? "married"
          : "single",
      })
    : undefined;

  return {
    revenuSalaire,
    revenuIndependant,
    revenuAccessoires,
    revenuRentes,
    revenuCapital,
    revenuImmobilier,
    revenuTotal,
    fortuneBrute,
    fortuneDettes,
    fortuneNette,
    deductionPilier3a,
    deductionLppRachats,
    deductionPrimes,
    deductionInterets,
    deductionFraisPro,
    deductionFraisMedicaux,
    deductionDons,
    deductionTotal,
    revenuImposable,
    taxEstimate,
    source,
    eventCount: ledger.eventCount,
  };
}

export async function buildBjPpDeclaration(params: {
  tenantId: string;
  year: number;
  draft?: TaxpayerDraftState;
}): Promise<FilledVsPpForm> {
  const { tenantId, year, draft } = params;
  const template = await loadBjPpTemplate();
  const company: CompanyInfo = await getCompany(tenantId);
  const projection = await projectBjPp({
    tenantId,
    year,
    refAmounts: template.reference_amounts,
    draft,
  });

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
