/**
 * Lexa — Simulateur fiscal V1
 * Session 22 (Lane A) — mis à jour Session 33 (barèmes officiels) + Session 37 (NE/JU/BJ)
 *
 * Estimation de l'impôt dû pour les cantons VS, GE, VD, FR, NE, JU, BJ.
 * Priority : barèmes officiels YAML (TaxScaleLoader) — fallback sur approximations tabulées V1.
 *
 * Session 33 : 6 TODOs barèmes cantonaux résolus — barèmes officiels 2026 intégrés.
 * Session 37 : Ajout barèmes NE (RSN 631.0), JU (RSJU 641.11), BJ (RSB 661.11).
 * TODOs maintenus :
 *   - IFD : barème official AFC exact (indexation 2026 à confirmer)
 *   - VS PP : tranches > 152k tronquées dans chunk ingéré (taux 14% utilisé comme max)
 *   - GE PP : tarif marié (art. 41 al. 2 LIPP) non ingéré — fallback barème approximatif
 *   - VD PP : coefficient annuel 2026 exact à confirmer sur vd.ch/aci
 *   - FR PP : barème tabulaire SCC-FR 2026 à scraper (délégué au SCC par LICD)
 *   - NE PP : barème officiel SCCO NE 2026 à confirmer (approximation S37)
 *   - JU PP : barème officiel SCCJ 2026 à confirmer (approximation S37)
 *   - BJ PP : barème officiel ADB-BE 2026 à confirmer (approximation S37)
 */

import {
  getScale,
  calcIccPpFromScale,
  type PpScale,
} from "../services/TaxScaleLoader.js";

export type TaxEstimate = {
  icc: number;           // Impôt cantonal + communal CHF
  ifd: number;           // Impôt fédéral direct CHF
  total: number;         // ICC + IFD
  effectiveRate: number; // total / revenuImposable (ratio, pas %)
  iccSource: "official-scale" | "approximation"; // source du calcul ICC
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
// TODO session 35+ : vérifier indexation renchérissement AFC 2026 exact

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
 * Estimation IFD 2026 — art. 36 LIFD.
 * TODO session 35+ : vérifier indexation AFC 2026 exact
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

// ── Barèmes cantonaux fallback (approximations V1 Session 22) ─────────────────
// Utilisés uniquement si le barème officiel YAML est absent ou confidence=low.

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

// ── Barèmes cantonaux NE/JU/BJ fallback (approximations Session 37) ──────────
// NE — Neuchâtel : taux de base × coefficient global ~1.76 (canton 111% + commune ~65%)
// Source : LCdir-NE RSN 631.0 Art. 40 — approximation SCCO NE 2026
const ICC_NE_BRACKETS_SINGLE = [
  { max: 12800, rate: 0 },
  { max: 20000, rate: 2.64 },
  { max: 30000, rate: 4.40 },
  { max: 45000, rate: 6.16 },
  { max: 65000, rate: 8.80 },
  { max: 90000, rate: 11.00 },
  { max: 130000, rate: 13.20 },
  { max: 200000, rate: 15.40 },
  { max: 300000, rate: 17.60 },
  { max: Infinity, rate: 22.00 },
];

const ICC_NE_BRACKETS_MARRIED = [
  { max: 25600, rate: 0 },
  { max: 36000, rate: 2.20 },
  { max: 50000, rate: 3.96 },
  { max: 70000, rate: 5.72 },
  { max: 95000, rate: 8.36 },
  { max: 130000, rate: 10.56 },
  { max: 180000, rate: 12.76 },
  { max: Infinity, rate: 16.50 },
];

// JU — Jura : taux de base × coefficient cantonal 2.40 (240%)
// Source : LI-JU RSJU 641.11 Art. 40 — approximation SCCJ 2026
const ICC_JU_BRACKETS_SINGLE = [
  { max: 11200, rate: 0 },
  { max: 20000, rate: 2.40 },
  { max: 30000, rate: 4.80 },
  { max: 45000, rate: 7.20 },
  { max: 65000, rate: 10.80 },
  { max: 90000, rate: 14.40 },
  { max: 130000, rate: 19.20 },
  { max: 200000, rate: 24.00 },
  { max: 350000, rate: 28.80 },
  { max: Infinity, rate: 31.20 },
];

const ICC_JU_BRACKETS_MARRIED = [
  { max: 22400, rate: 0 },
  { max: 34000, rate: 2.16 },
  { max: 50000, rate: 4.32 },
  { max: 72000, rate: 7.20 },
  { max: 100000, rate: 12.00 },
  { max: 150000, rate: 17.28 },
  { max: 250000, rate: 21.60 },
  { max: Infinity, rate: 26.40 },
];

// BJ — Jura bernois (tarif BE) : taux de base × coefficient cantonal 3.04 (304%)
// Source : LIMP-BE RSB 661.11 Art. 42 — approximation ADB 2026
const ICC_BJ_BRACKETS_SINGLE = [
  { max: 15000, rate: 0 },
  { max: 22000, rate: 3.04 },
  { max: 33000, rate: 6.08 },
  { max: 48000, rate: 9.12 },
  { max: 70000, rate: 13.68 },
  { max: 100000, rate: 18.24 },
  { max: 150000, rate: 24.32 },
  { max: 250000, rate: 30.40 },
  { max: 400000, rate: 36.48 },
  { max: Infinity, rate: 40.13 },
];

const ICC_BJ_BRACKETS_MARRIED = [
  { max: 30000, rate: 0 },
  { max: 44000, rate: 2.74 },
  { max: 65000, rate: 5.47 },
  { max: 95000, rate: 9.12 },
  { max: 135000, rate: 15.20 },
  { max: 200000, rate: 21.89 },
  { max: 350000, rate: 27.36 },
  { max: Infinity, rate: 34.22 },
];

// ── Estimation ICC PP ──────────────────────────────────────────────────────────

/** Cantons supportés pour l'estimation fiscale PP */
export type SupportedCanton = "VS" | "GE" | "VD" | "FR" | "NE" | "JU" | "BJ";

/**
 * Estimation ICC 2026 (impôt cantonal + communal combiné).
 * Utilise le barème officiel YAML en priorité (confidence >= medium).
 * Fallback sur barèmes tabulés approximatifs V1 si YAML absent ou low confidence.
 *
 * @returns { icc: number; source: "official-scale" | "approximation" }
 */
export function estimateIccWithSource(
  revenuImposable: number,
  canton: SupportedCanton,
  civilStatus: "single" | "married" = "single",
  year: number = 2026,
): { icc: number; source: "official-scale" | "approximation" } {
  // Tentative barème officiel
  const scale = getScale(canton, "PP", year);
  if (scale && scale.entity === "PP") {
    const result = calcIccPpFromScale(scale as PpScale, revenuImposable, civilStatus);
    if (result !== null) {
      return { icc: round2(result), source: "official-scale" };
    }
  }

  // Fallback approximation V1/S37
  const isSingle = civilStatus === "single";
  let icc: number;
  switch (canton) {
    case "VS":
      icc = progressiveTax(revenuImposable, isSingle ? ICC_VS_BRACKETS_SINGLE : ICC_VS_BRACKETS_MARRIED);
      break;
    case "GE":
      icc = progressiveTax(revenuImposable, isSingle ? ICC_GE_BRACKETS_SINGLE : ICC_GE_BRACKETS_MARRIED);
      break;
    case "VD":
      icc = progressiveTax(revenuImposable, isSingle ? ICC_VD_BRACKETS_SINGLE : ICC_VD_BRACKETS_MARRIED);
      break;
    case "FR":
      icc = progressiveTax(revenuImposable, isSingle ? ICC_FR_BRACKETS_SINGLE : ICC_FR_BRACKETS_MARRIED);
      break;
    case "NE":
      icc = progressiveTax(revenuImposable, isSingle ? ICC_NE_BRACKETS_SINGLE : ICC_NE_BRACKETS_MARRIED);
      break;
    case "JU":
      icc = progressiveTax(revenuImposable, isSingle ? ICC_JU_BRACKETS_SINGLE : ICC_JU_BRACKETS_MARRIED);
      break;
    case "BJ":
      icc = progressiveTax(revenuImposable, isSingle ? ICC_BJ_BRACKETS_SINGLE : ICC_BJ_BRACKETS_MARRIED);
      break;
    default:
      throw new Error(`Canton non supporté pour l'estimation fiscale: ${canton}`);
  }
  return { icc, source: "approximation" };
}

/**
 * Estimation ICC 2026 — interface simplifiée (backward compat).
 */
export function estimateIcc(
  revenuImposable: number,
  canton: SupportedCanton,
  civilStatus: "single" | "married",
): number {
  return estimateIccWithSource(revenuImposable, canton, civilStatus).icc;
}

/**
 * Estimation complète de l'impôt dû (ICC + IFD).
 *
 * @returns TaxEstimate avec ICC, IFD, total, taux effectif, source barème et disclaimer
 */
export function estimateTaxDue(params: {
  canton: SupportedCanton;
  year: number;
  revenuImposable: number;
  civilStatus?: "single" | "married";
}): TaxEstimate {
  const civil = params.civilStatus ?? "single";
  const year = params.year ?? 2026;
  const ifd = estimateIfd(params.revenuImposable, civil);
  const { icc, source } = estimateIccWithSource(params.revenuImposable, params.canton, civil, year);
  const total = round2(ifd + icc);

  const sourceLabel = source === "official-scale"
    ? "barèmes officiels 2026 ingérés"
    : "barèmes tabulés approximatifs V1";

  return {
    icc: round2(icc),
    ifd: round2(ifd),
    total,
    effectiveRate:
      params.revenuImposable > 0
        ? round2(total / params.revenuImposable)
        : 0,
    iccSource: source,
    disclaimer:
      `Estimation indicative basée sur les ${sourceLabel}. ` +
      "Le montant réel dépend de votre commune, des déductions additionnelles " +
      "et des règles cantonales fines. Vérifiez avec votre fiduciaire.",
  };
}
