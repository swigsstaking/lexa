/**
 * Lexa — Simulateur fiscal PM (Personnes Morales) V1
 * Session 26 — mis à jour Session 33 (barèmes officiels)
 *
 * Estimation de l'impôt dû pour une Sàrl/SA suisse.
 * IFD : 8.5% flat (art. 68 LIFD) — taux unique, sans progressivité.
 * ICC PM : barèmes officiels YAML en priorité, fallback sur approximations V1.
 * Impôt sur le capital : barèmes officiels YAML en priorité.
 *
 * Session 33 : TODOs barèmes PM résolus — barèmes officiels 2026 intégrés.
 * TODOs maintenus :
 *   - VS PM capital : coefficient communal doublé (approx.) — art. 180a LF VS à affiner
 *   - FR PM capital SA/Sàrl : article LICD FR capital SA/Sàrl à confirmer (confidence=medium)
 *   - Impôt minimum PM VD : art. 123+ LI VD non géré
 */

import {
  getScale,
  calcIccPmBenefitFromScale,
  calcIccPmCapitalFromScale,
  type PmScale,
} from "../services/TaxScaleLoader.js";

export type PmTaxEstimate = {
  benefit: number;       // bénéfice imposable après corrections CHF
  capital: number;       // capital imposable (fonds propres) CHF
  ifd: number;           // IFD 8.5% × bénéfice (art. 68 LIFD)
  icc: number;           // ICC cantonal (bénéfice) CHF
  capitalTax: number;    // impôt sur capital CHF
  total: number;         // IFD + ICC + capital
  effectiveRate: number; // total / benefit (ratio décimal, pas %)
  iccSource: "official-scale" | "approximation"; // source du calcul ICC bénéfice
  capitalSource: "official-scale" | "approximation"; // source du calcul capital
  disclaimer: string;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * IFD PM : 8.5% flat sur le bénéfice net imposable.
 * Source : art. 68 LIFD (RS 642.11) — taux unique sans progressivité pour PM.
 */
export function estimateIfdPm(benefit: number): number {
  return round2(Math.max(0, benefit * 0.085));
}

export type PmCanton = "VS" | "GE" | "VD" | "FR" | "NE" | "JU" | "BJ";

/**
 * ICC PM par canton — utilise barèmes officiels YAML en priorité.
 * Fallback sur approximations V1 si YAML absent ou confidence=low.
 */
export function estimateIccPmWithSource(
  benefit: number,
  canton: PmCanton,
  year: number = 2026,
): { icc: number; source: "official-scale" | "approximation" } {
  // Tentative barème officiel (YAML) — pour VS/GE/VD/FR uniquement à ce stade
  const scaleCantons = ["VS", "GE", "VD", "FR"] as const;
  if (scaleCantons.includes(canton as typeof scaleCantons[number])) {
    const scale = getScale(canton, "PM", year);
    if (scale && scale.entity === "PM") {
      const result = calcIccPmBenefitFromScale(scale as PmScale, benefit);
      if (result !== null) {
        return { icc: round2(Math.max(0, result)), source: "official-scale" };
      }
    }
  }

  // Fallback approximations V1 :
  //   VS : ~8.5% (LF VS cantonal ~2.25%+5.2% progressif + communal ~2.75%+6.75% ≈ 8.5% combiné)
  //   GE : ~14.0% (LIPM GE 3.33% cantonal + IFD = total plus communal inclus dans ICC unifié)
  //   VD : ~13.5% (LI VD 3.333% cantonal + coeff communal moyen Lausanne)
  //   FR : ~10.0% (LICD FR 4% cantonal + coefficients communaux moyens)
  //   NE : ~16.5% (LIPM-NE RSN 631.0 — taux bénéfice ~16.5%)
  //   JU : ~15.5% (LICD-JU RSJU 641.11 — taux bénéfice ~15.5%)
  //   BJ : ~18.6% (LICD-BE RSB 661.11 — taux bénéfice ~18.6% Berne)
  const rates: Record<PmCanton, number> = {
    VS: 0.085,
    GE: 0.14,
    VD: 0.135,
    FR: 0.10,
    NE: 0.165,
    JU: 0.155,
    BJ: 0.186,
  };
  const rate = rates[canton] ?? 0.10;
  return { icc: round2(Math.max(0, benefit * rate)), source: "approximation" };
}

/**
 * ICC PM — interface simplifiée (backward compat).
 */
export function estimateIccPm(
  benefit: number,
  canton: PmCanton,
): number {
  return estimateIccPmWithSource(benefit, canton).icc;
}

/**
 * Impôt sur le capital — barèmes officiels YAML en priorité, fallback V1.
 *
 * Barèmes officiels (Session 33) :
 *   VS : Art. 99 LF VS — 1‰ jusqu'à 500k, 2.5‰ au-delà (cantonal × 2 pour communal approx.)
 *   GE : Art. 33 LIPM-GE — 1.8‰ flat
 *   VD : Art. 118 LI VD — 0.6‰ flat
 *   FR : LICD FR — 1‰ flat (sa_sarl_standard confidence=medium)
 *
 * Fallback V1 :
 *   VS : ~0.15%, GE : ~0.24%, VD : ~0.17%, FR : ~0.10%
 *   NE : ~0.45‰ (LIPM-NE RSN 631.0 — taux capital ~0.45‰)
 *   JU : ~0.50‰ (LICD-JU RSJU 641.11 — taux capital ~0.50‰)
 *   BJ : ~0.30‰ (LICD-BE RSB 661.11 — taux capital ~0.30‰)
 */
export function estimateCapitalTaxWithSource(
  capital: number,
  canton: PmCanton,
  year: number = 2026,
): { capitalTax: number; source: "official-scale" | "approximation" } {
  // Tentative barème officiel (YAML) — pour VS/GE/VD/FR uniquement à ce stade
  const scaleCantons = ["VS", "GE", "VD", "FR"] as const;
  if (scaleCantons.includes(canton as typeof scaleCantons[number])) {
    const scale = getScale(canton, "PM", year);
    if (scale && scale.entity === "PM") {
      const result = calcIccPmCapitalFromScale(scale as PmScale, capital);
      if (result !== null) {
        return { capitalTax: round2(Math.max(0, result)), source: "official-scale" };
      }
    }
  }

  // Fallback approximations V1
  const capitalRates: Record<PmCanton, number> = {
    VS: 0.0015,
    GE: 0.0024,
    VD: 0.0017,
    FR: 0.0010,
    NE: 0.00045,
    JU: 0.00050,
    BJ: 0.00030,
  };
  const rate = capitalRates[canton] ?? 0.0015;
  return { capitalTax: round2(Math.max(0, capital * rate)), source: "approximation" };
}

/**
 * Impôt sur le capital — interface simplifiée (backward compat).
 */
export function estimateCapitalTax(
  capital: number,
  canton: PmCanton,
): number {
  return estimateCapitalTaxWithSource(capital, canton).capitalTax;
}

/**
 * Estimation complète de l'impôt PM dû (IFD + ICC + capital).
 *
 * Session 33 : utilise barèmes officiels YAML pour ICC et capital.
 */
export function estimatePmTaxDue(params: {
  canton: PmCanton;
  year: number;
  benefit: number;   // bénéfice imposable (après corrections fiscales)
  capital: number;   // fonds propres (capital + réserves)
}): PmTaxEstimate {
  const year = params.year ?? 2026;
  const ifd = estimateIfdPm(params.benefit);
  const { icc, source: iccSource } = estimateIccPmWithSource(params.benefit, params.canton, year);
  const { capitalTax, source: capitalSource } = estimateCapitalTaxWithSource(params.capital, params.canton, year);
  const total = round2(ifd + icc + capitalTax);

  const iccLabel = iccSource === "official-scale" ? "barèmes officiels 2026 ingérés" : "barèmes approximatifs V1";
  const capitalLabel = capitalSource === "official-scale" ? "barèmes officiels 2026" : "approximatifs V1";

  return {
    benefit: round2(params.benefit),
    capital: round2(params.capital),
    ifd,
    icc,
    capitalTax,
    total,
    effectiveRate:
      params.benefit > 0
        ? round2(total / params.benefit)
        : 0,
    iccSource,
    capitalSource,
    disclaimer:
      `Estimation indicative — ICC bénéfice via ${iccLabel}, capital via ${capitalLabel}. ` +
      "Le montant réel dépend des corrections fiscales exactes, de la commune, " +
      "du coefficient multiplicateur cantonal/communal et des spécificités cantonales PM. " +
      "Vérifiez avec votre fiduciaire.",
  };
}
