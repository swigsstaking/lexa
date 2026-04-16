/**
 * TaxSimulator — Service simulations fiscales "et si ?" (session 31)
 *
 * Fonctions :
 * - simulateRachatLpp      : économie fiscale rachat LPP (LIFD art. 33 al. 1 let. d)
 * - simulatePilier3aVariation : variation pilier 3a (LIFD art. 33 al. 1 let. e)
 * - simulateDividendVsSalary  : comparaison dividende vs salaire (LIFD art. 20 al. 1bis, LAVS)
 *
 * Réutilise estimateTaxDue() de taxEstimator.ts (S22).
 */

import { estimateTaxDue } from "../execution/taxEstimator.js";

// ── Types résultats ────────────────────────────────────────────────────────────

export type LppSimulation = {
  additionalLppPurchase: number;
  baseTax: number;
  afterLppTax: number;
  savings: number;                // économie fiscale totale CHF
  effectiveSavingsRate: number;   // économie / rachat en %
  incomeAfterDeduction: number;
  citation: { law: string; article: string; alinea: string };
  disclaimer: string;
};

export type Pilier3aSimulation = {
  current3a: number;
  target3a: number;
  additionalContribution: number;
  cappedAdditionalContribution: number;  // après plafond légal
  baseTax: number;
  afterTax: number;
  savings: number;
  effectiveSavingsRate: number;
  plafond2026: number;            // plafond applicable (avec/sans LPP)
  citation: { law: string; article: string; alinea: string };
  disclaimer: string;
};

export type DividendSalarySimulation = {
  amountAvailable: number;
  salary: {
    grossToEmployee: number;
    avsEmployeeCharge: number;    // 6.35% employé
    avsEmployerCharge: number;    // 6.45% employeur (coût additionnel société)
    taxableIncome: number;
    incomeTax: number;
    netInHand: number;
    companyCost: number;          // coût total pour la société
  };
  dividend: {
    corporateTaxIfd: number;      // IFD PM 8.5%
    corporateTaxCantonal: number; // ICC PM estimation
    dividendPayable: number;      // après IS société
    dividendTax: number;          // IS actionnaire (réduction 60% si qualif.)
    netInHand: number;
  };
  recommendation: "dividend" | "salary" | "equal";
  savingsByDividend: number;      // > 0 si dividende avantageux
  citations: Array<{ law: string; article?: string; alinea?: string; note?: string }>;
  disclaimer: string;
};

// ── Plafonds 2026 ──────────────────────────────────────────────────────────────

/** Plafond pilier 3a 2026 avec affiliation LPP (CHF) */
export const PILIER_3A_AVEC_LPP_2026 = 7260;
/** Plafond pilier 3a 2026 sans affiliation LPP (20% du revenu, max CHF) */
export const PILIER_3A_SANS_LPP_2026_MAX = 36_288;

// ── Taux ICC PM simplifié par canton (estimation 2026) ────────────────────────
// Source : barèmes cantonaux publics 2026 (approximatif)
const ICC_PM_RATES: Record<"VS" | "GE" | "VD" | "FR", number> = {
  VS: 0.085,   // ~8.5% effectif canton+commune
  GE: 0.140,   // ~14% (LIPP GE très progressive)
  VD: 0.135,   // ~13.5% (LI VD)
  FR: 0.100,   // ~10% (LICD FR)
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── simulateRachatLpp ─────────────────────────────────────────────────────────

/**
 * Simulation rachat LPP — LIFD art. 33 al. 1 let. d
 *
 * Un rachat LPP est déductible du revenu imposable PP.
 * L'économie fiscale = différence d'impôt avant/après déduction.
 *
 * Note : le plafond de rachat dépend du certificat LPP individuel (non calculable ici).
 */
export function simulateRachatLpp(params: {
  canton: "VS" | "GE" | "VD" | "FR";
  year: number;
  currentIncome: number;
  additionalLppPurchase: number;
  civilStatus?: "single" | "married";
}): LppSimulation {
  if (params.currentIncome < 0) throw new Error("currentIncome doit être positif");
  if (params.additionalLppPurchase <= 0) throw new Error("additionalLppPurchase doit être > 0");

  const civil = params.civilStatus ?? "single";

  const baseTaxResult = estimateTaxDue({
    canton: params.canton,
    year: params.year,
    revenuImposable: params.currentIncome,
    civilStatus: civil,
  });

  const incomeAfterDeduction = Math.max(0, params.currentIncome - params.additionalLppPurchase);
  const afterTaxResult = estimateTaxDue({
    canton: params.canton,
    year: params.year,
    revenuImposable: incomeAfterDeduction,
    civilStatus: civil,
  });

  const savings = round2(baseTaxResult.total - afterTaxResult.total);
  const effectiveSavingsRate = params.additionalLppPurchase > 0
    ? round2((savings / params.additionalLppPurchase) * 100)
    : 0;

  return {
    additionalLppPurchase: params.additionalLppPurchase,
    baseTax: baseTaxResult.total,
    afterLppTax: afterTaxResult.total,
    savings,
    effectiveSavingsRate,
    incomeAfterDeduction,
    citation: { law: "LIFD", article: "33", alinea: "1 let. d" },
    disclaimer:
      "Simulation indicative — le plafond de rachat LPP dépend de vos prestations de prévoyance individuelles " +
      "(certificat LPP de votre caisse). Un rachat effectué dans les 3 ans avant la retraite est soumis à " +
      "restrictions (art. 22 OPP2). Vérifiez avec votre caisse LPP et votre fiduciaire avant décision.",
  };
}

// ── simulatePilier3aVariation ─────────────────────────────────────────────────

/**
 * Simulation variation pilier 3a — LIFD art. 33 al. 1 let. e
 *
 * Augmenter sa cotisation 3a jusqu'au plafond = déduction directe du revenu imposable.
 * Plafonds 2026 : 7'260 avec LPP, 36'288 sans LPP (max 20% revenu net).
 */
export function simulatePilier3aVariation(params: {
  canton: "VS" | "GE" | "VD" | "FR";
  year: number;
  currentIncome: number;
  current3a: number;
  target3a: number;
  hasLpp?: boolean;           // true = affilié LPP (défaut), false = indépendant sans LPP
  civilStatus?: "single" | "married";
}): Pilier3aSimulation {
  const hasLpp = params.hasLpp !== false; // défaut true
  const civil = params.civilStatus ?? "single";

  // Calculer plafond applicable
  let plafond2026: number;
  if (hasLpp) {
    plafond2026 = PILIER_3A_AVEC_LPP_2026;
  } else {
    // Sans LPP : 20% du revenu net, max 36'288
    plafond2026 = Math.min(
      PILIER_3A_SANS_LPP_2026_MAX,
      params.currentIncome * 0.2,
    );
  }

  // Plafonner target3a
  const cappedTarget = Math.min(params.target3a, plafond2026);
  const additionalContribution = Math.max(0, params.target3a - params.current3a);
  const cappedAdditional = Math.max(0, cappedTarget - params.current3a);

  const baseTaxResult = estimateTaxDue({
    canton: params.canton,
    year: params.year,
    revenuImposable: Math.max(0, params.currentIncome - params.current3a),
    civilStatus: civil,
  });

  const afterTaxResult = estimateTaxDue({
    canton: params.canton,
    year: params.year,
    revenuImposable: Math.max(0, params.currentIncome - cappedTarget),
    civilStatus: civil,
  });

  const savings = round2(baseTaxResult.total - afterTaxResult.total);
  const effectiveSavingsRate = cappedAdditional > 0
    ? round2((savings / cappedAdditional) * 100)
    : 0;

  return {
    current3a: params.current3a,
    target3a: params.target3a,
    additionalContribution,
    cappedAdditionalContribution: cappedAdditional,
    baseTax: baseTaxResult.total,
    afterTax: afterTaxResult.total,
    savings,
    effectiveSavingsRate,
    plafond2026,
    citation: { law: "LIFD", article: "33", alinea: "1 let. e" },
    disclaimer:
      `Simulation indicative — plafond 3a 2026 avec LPP : ${PILIER_3A_AVEC_LPP_2026.toLocaleString("fr-CH")} CHF, ` +
      `sans LPP : ${PILIER_3A_SANS_LPP_2026_MAX.toLocaleString("fr-CH")} CHF max (20% revenu net). ` +
      "Vérifiez avec votre fiduciaire et votre fondation 3a.",
  };
}

// ── simulateDividendVsSalary ──────────────────────────────────────────────────

/**
 * Simulation dividende vs salaire — LIFD art. 20 al. 1bis + LAVS
 *
 * Comparaison de 2 stratégies de rémunération de l'actionnaire :
 * 1. Salaire : déductible côté société, soumis AVS + impôt revenu PP
 * 2. Dividende : non déductible société (IS PM), mais réduction 60% si participation ≥10%
 *
 * Taux AVS 2026 :
 * - Employé : 6.35% (5.3% AVS + 1.0% AI + 0.05% APG)
 * - Employeur : 6.45% (5.3% AVS + 1.0% AI + 0.05% APG + 0.10% AC)
 *
 * Note : calcul simplifié — la recommandation finale dépend aussi
 * du 2e pilier (LPP), des prestations chômage, et de la situation personnelle.
 */
export function simulateDividendVsSalary(params: {
  amountAvailable: number;
  shareholderMarginalRate: number;  // taux marginal actionnaire (ratio, ex: 0.25 = 25%)
  canton: "VS" | "GE" | "VD" | "FR";
  legalForm: "sarl" | "sa";
}): DividendSalarySimulation {
  if (params.amountAvailable <= 0) throw new Error("amountAvailable doit être > 0");
  if (params.shareholderMarginalRate < 0 || params.shareholderMarginalRate > 1) {
    throw new Error("shareholderMarginalRate doit être entre 0 et 1");
  }

  const { amountAvailable, shareholderMarginalRate, canton } = params;
  const marginal = shareholderMarginalRate;

  // ── Option 1 : Salaire ──
  const AVS_EMPLOYEE_RATE = 0.0635;   // 6.35% employé
  const AVS_EMPLOYER_RATE = 0.0645;   // 6.45% employeur (en sus du brut)

  const avsEmployeeCharge = round2(amountAvailable * AVS_EMPLOYEE_RATE);
  const avsEmployerCharge = round2(amountAvailable * AVS_EMPLOYER_RATE);
  const taxableIncomeSalary = round2(amountAvailable - avsEmployeeCharge);
  const incomeTaxSalary = round2(taxableIncomeSalary * marginal);
  const netInHandSalary = round2(taxableIncomeSalary - incomeTaxSalary);
  const companyCostSalary = round2(amountAvailable + avsEmployerCharge);

  // ── Option 2 : Dividende ──
  // IS fédéral PM : 8.5% sur bénéfice (LIFD art. 68)
  const IFD_PM_RATE = 0.085;
  const iccPmRate = ICC_PM_RATES[canton];

  const corporateTaxIfd = round2(amountAvailable * IFD_PM_RATE);
  const corporateTaxCantonal = round2(amountAvailable * iccPmRate);
  const totalCorporateTax = round2(corporateTaxIfd + corporateTaxCantonal);
  const dividendPayable = round2(amountAvailable - totalCorporateTax);

  // Réduction 60% sur dividende si participation qualifiée ≥10% (LIFD art. 20 al. 1bis)
  // → seuls 40% du dividende sont imposables au taux marginal
  const QUALIFIED_PARTICIPATION_REDUCTION = 0.40; // 40% imposable
  const dividendTaxBase = round2(dividendPayable * QUALIFIED_PARTICIPATION_REDUCTION);
  const dividendTax = round2(dividendTaxBase * marginal);
  const netInHandDividend = round2(dividendPayable - dividendTax);

  // ── Recommandation ──
  const diff = round2(netInHandDividend - netInHandSalary);
  const recommendation: "dividend" | "salary" | "equal" =
    diff > 100 ? "dividend" : diff < -100 ? "salary" : "equal";

  return {
    amountAvailable,
    salary: {
      grossToEmployee: amountAvailable,
      avsEmployeeCharge,
      avsEmployerCharge,
      taxableIncome: taxableIncomeSalary,
      incomeTax: incomeTaxSalary,
      netInHand: netInHandSalary,
      companyCost: companyCostSalary,
    },
    dividend: {
      corporateTaxIfd,
      corporateTaxCantonal,
      dividendPayable,
      dividendTax,
      netInHand: netInHandDividend,
    },
    recommendation,
    savingsByDividend: diff,
    citations: [
      { law: "LIFD", article: "20", alinea: "1bis", note: "Réduction 60% dividende participation qualifiée ≥10%" },
      { law: "LIFD", article: "68", note: "IFD PM 8.5% sur bénéfice net" },
      { law: "LAVS", note: `Taux AVS 2026 : ${(AVS_EMPLOYEE_RATE * 100).toFixed(2)}% employé + ${(AVS_EMPLOYER_RATE * 100).toFixed(2)}% employeur` },
    ],
    disclaimer:
      "Comparaison simplifiée — ne tient pas compte du 2e pilier LPP (assiette AVS impacte futur), " +
      "des prestations chômage, des cotisations AC, ni de la situation personnelle complète. " +
      "La réduction dividende 60% s'applique uniquement si la participation est ≥10% du capital (LIFD art. 20 al. 1bis). " +
      "Consulter votre fiduciaire avant toute décision.",
  };
}
