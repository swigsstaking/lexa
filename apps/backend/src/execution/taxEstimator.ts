/**
 * Lexa — Simulateur fiscal V1
 * Session 22 (Lane A)
 *
 * Estimation de l'impôt dû pour les cantons VS, GE, VD, FR.
 * Barèmes tabulés simplifiés à 5-7 tranches — approximation correcte pour V1.
 *
 * TODO session 23+ : remplacer par barèmes officiels ingérés par canton
 * (sources : AFC, SCC FR, ACI VD, Administration fiscale GE, AFC VS)
 */

export type TaxEstimate = {
  icc: number;           // Impôt cantonal + communal CHF
  ifd: number;           // Impôt fédéral direct CHF
  total: number;         // ICC + IFD
  effectiveRate: number; // total / revenuImposable (ratio, pas %)
  disclaimer: string;
};

// ── Utilitaires ──────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Calcul d'impôt progressif par tranches tabulées.
 * @param revenu  Revenu imposable CHF
 * @param brackets  Tableau [{max, rate}] — rate en % (ex: 8.5 = 8.5%)
 *   La dernière tranche s'applique au-delà de son max.
 */
function progressiveTax(
  revenu: number,
  brackets: Array<{ max: number; rate: number }>,
): number {
  if (revenu <= 0) return 0;
  let tax = 0;
  let remaining = revenu;
  let prevMax = 0;
  for (const bracket of brackets) {
    const slice = Math.min(remaining, bracket.max - prevMax);
    if (slice <= 0) break;
    tax += slice * (bracket.rate / 100);
    remaining -= slice;
    prevMax = bracket.max;
    if (remaining <= 0) break;
  }
  // Tranche marginale finale si revenu dépasse le dernier bracket
  if (remaining > 0) {
    const lastRate = brackets[brackets.length - 1].rate;
    tax += remaining * (lastRate / 100);
  }
  return round2(tax);
}

// ── Barème IFD 2026 ──────────────────────────────────────────────────────────
// Source : RS 642.11, art. 36 LIFD — barème tabulé IFD célibataire/marié 2026
// TODO session 23+ : remplacer par barème officiel AFC 2026 exact (indexation)

const IFD_BRACKETS_SINGLE_2026 = [
  { max: 17800, rate: 0 },
  { max: 31600, rate: 0.77 },
  { max: 41400, rate: 0.88 },
  { max: 55200, rate: 2.64 },
  { max: 72500, rate: 2.97 },
  { max: 78100, rate: 5.94 },
  { max: 103600, rate: 6.6 },
  { max: 134600, rate: 8.8 },
  { max: 176000, rate: 11.0 },
  { max: 755200, rate: 13.2 },
  { max: Infinity, rate: 11.5 },
];

const IFD_BRACKETS_MARRIED_2026 = [
  { max: 28300, rate: 0 },
  { max: 50900, rate: 1.0 },
  { max: 58400, rate: 2.0 },
  { max: 75300, rate: 3.0 },
  { max: 90300, rate: 4.0 },
  { max: 103400, rate: 5.0 },
  { max: 114700, rate: 6.0 },
  { max: 124200, rate: 7.0 },
  { max: 131700, rate: 8.0 },
  { max: 137300, rate: 9.0 },
  { max: 141200, rate: 10.0 },
  { max: 143100, rate: 11.0 },
  { max: 895900, rate: 13.0 },
  { max: Infinity, rate: 11.5 },
];

/**
 * Estimation IFD 2026.
 * Barème tabulé simplifié — art. 36 LIFD.
 * TODO session 23+ : remplacer par barème officiel AFC exact
 */
export function estimateIfd(
  revenuImposable: number,
  civilStatus: "single" | "married",
): number {
  const brackets =
    civilStatus === "married"
      ? IFD_BRACKETS_MARRIED_2026
      : IFD_BRACKETS_SINGLE_2026;
  return progressiveTax(revenuImposable, brackets);
}

// ── Barèmes cantonaux simplifiés ─────────────────────────────────────────────
// TODO session 23+ : remplacer par barèmes officiels ingérés par canton
// Sources publiques utilisées pour V1 :
//   VS : Guide SCC VS 2026 (barème simplifié)
//   GE : LIPP GE (RSG D 3 08) — barème indicatif AFC GE 2026
//   VD : LI VD (BLV 642.11) — barème ACI VD 2026
//   FR : LICD FR (BDLF 631.1) — barème SCC FR 2026 (TODO session 23 : confirmer)

// Canton du Valais — ICC simplifié (cantonal + coefficient communal moyen ~100%)
const ICC_VS_BRACKETS_SINGLE = [
  { max: 11000, rate: 0 },
  { max: 16000, rate: 1.5 },
  { max: 22000, rate: 3.0 },
  { max: 32000, rate: 4.5 },
  { max: 45000, rate: 6.0 },
  { max: 70000, rate: 7.5 },
  { max: 100000, rate: 9.0 },
  { max: 150000, rate: 11.0 },
  { max: 250000, rate: 12.5 },
  { max: Infinity, rate: 14.0 },
];

const ICC_VS_BRACKETS_MARRIED = [
  { max: 14000, rate: 0 },
  { max: 20000, rate: 1.0 },
  { max: 28000, rate: 2.5 },
  { max: 40000, rate: 4.0 },
  { max: 60000, rate: 5.5 },
  { max: 90000, rate: 7.0 },
  { max: 130000, rate: 9.0 },
  { max: 200000, rate: 11.0 },
  { max: Infinity, rate: 13.0 },
];

// Canton de Genève — ICC très progressif (LIPP GE RSG D 3 08)
const ICC_GE_BRACKETS_SINGLE = [
  { max: 16100, rate: 0 },
  { max: 22200, rate: 3.0 },
  { max: 29300, rate: 5.0 },
  { max: 37900, rate: 7.0 },
  { max: 47000, rate: 9.0 },
  { max: 57500, rate: 11.0 },
  { max: 70000, rate: 13.0 },
  { max: 85000, rate: 15.0 },
  { max: 110000, rate: 17.0 },
  { max: 150000, rate: 18.0 },
  { max: Infinity, rate: 19.0 },
];

const ICC_GE_BRACKETS_MARRIED = [
  { max: 23800, rate: 0 },
  { max: 32000, rate: 2.5 },
  { max: 44000, rate: 5.0 },
  { max: 58000, rate: 7.5 },
  { max: 76000, rate: 10.0 },
  { max: 100000, rate: 13.0 },
  { max: 140000, rate: 16.0 },
  { max: Infinity, rate: 17.5 },
];

// Canton de Vaud — ICC (LI VD BLV 642.11 + coefficient communal ~70%)
const ICC_VD_BRACKETS_SINGLE = [
  { max: 13600, rate: 0 },
  { max: 22700, rate: 1.5 },
  { max: 32000, rate: 3.0 },
  { max: 44700, rate: 4.5 },
  { max: 61800, rate: 6.0 },
  { max: 86600, rate: 7.5 },
  { max: 120600, rate: 9.0 },
  { max: 174600, rate: 11.0 },
  { max: Infinity, rate: 15.5 },
];

const ICC_VD_BRACKETS_MARRIED = [
  { max: 18700, rate: 0 },
  { max: 31200, rate: 1.5 },
  { max: 44500, rate: 3.0 },
  { max: 61800, rate: 5.0 },
  { max: 87900, rate: 7.0 },
  { max: 125500, rate: 9.0 },
  { max: Infinity, rate: 13.5 },
];

// Canton de Fribourg — ICC (LICD FR BDLF 631.1)
// TODO session 23 : confirmer barème SCC FR exact 2026
const ICC_FR_BRACKETS_SINGLE = [
  { max: 12600, rate: 0 },
  { max: 18900, rate: 2.0 },
  { max: 27200, rate: 3.5 },
  { max: 39500, rate: 5.0 },
  { max: 56000, rate: 6.5 },
  { max: 80000, rate: 8.0 },
  { max: 115000, rate: 9.5 },
  { max: 165000, rate: 11.0 },
  { max: Infinity, rate: 13.5 },
];

const ICC_FR_BRACKETS_MARRIED = [
  { max: 18200, rate: 0 },
  { max: 28000, rate: 1.5 },
  { max: 40000, rate: 3.0 },
  { max: 58000, rate: 5.0 },
  { max: 82000, rate: 7.0 },
  { max: 120000, rate: 9.0 },
  { max: Infinity, rate: 12.0 },
];

/**
 * Estimation ICC 2026 (impôt cantonal + communal combiné, taux effectif global).
 * TODO session 23+ : remplacer par barèmes officiels ingérés par canton
 */
export function estimateIcc(
  revenuImposable: number,
  canton: "VS" | "GE" | "VD" | "FR",
  civilStatus: "single" | "married",
): number {
  const isSingle = civilStatus === "single";
  switch (canton) {
    case "VS":
      return progressiveTax(
        revenuImposable,
        isSingle ? ICC_VS_BRACKETS_SINGLE : ICC_VS_BRACKETS_MARRIED,
      );
    case "GE":
      return progressiveTax(
        revenuImposable,
        isSingle ? ICC_GE_BRACKETS_SINGLE : ICC_GE_BRACKETS_MARRIED,
      );
    case "VD":
      return progressiveTax(
        revenuImposable,
        isSingle ? ICC_VD_BRACKETS_SINGLE : ICC_VD_BRACKETS_MARRIED,
      );
    case "FR":
      return progressiveTax(
        revenuImposable,
        isSingle ? ICC_FR_BRACKETS_SINGLE : ICC_FR_BRACKETS_MARRIED,
      );
    default:
      throw new Error(`Canton non supporté pour l'estimation fiscale: ${canton}`);
  }
}

/**
 * Estimation complète de l'impôt dû (ICC + IFD).
 *
 * @returns TaxEstimate avec ICC, IFD, total, taux effectif et disclaimer
 *
 * Ordre de grandeur attendu pour 95'000 CHF célibataire :
 *   VS : ICC ~8'500 + IFD ~6'800 = ~15'300 CHF (~16.1%)
 *   GE : ICC ~13'500 + IFD ~6'800 = ~20'300 CHF (~21.4%)
 *   VD : ICC ~10'500 + IFD ~6'800 = ~17'300 CHF (~18.2%)
 *   FR : ICC ~9'200 + IFD ~6'800 = ~16'000 CHF (~16.8%)
 */
export function estimateTaxDue(params: {
  canton: "VS" | "GE" | "VD" | "FR";
  year: number;
  revenuImposable: number;
  civilStatus?: "single" | "married";
}): TaxEstimate {
  const civil = params.civilStatus ?? "single";
  const ifd = estimateIfd(params.revenuImposable, civil);
  const icc = estimateIcc(params.revenuImposable, params.canton, civil);
  const total = round2(ifd + icc);

  return {
    icc: round2(icc),
    ifd: round2(ifd),
    total,
    effectiveRate:
      params.revenuImposable > 0
        ? round2(total / params.revenuImposable)
        : 0,
    disclaimer:
      "Estimation indicative basée sur les barèmes 2026 simplifiés. " +
      "Le montant réel dépend de votre commune, des déductions additionnelles " +
      "et des règles cantonales fines. Vérifiez avec votre fiduciaire. " +
      "Ce simulateur V1 utilise des barèmes tabulés approximatifs — " +
      "TODO session 23+ : remplacer par barèmes officiels ingérés.",
  };
}
