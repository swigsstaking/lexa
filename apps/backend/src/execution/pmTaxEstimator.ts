/**
 * Lexa — Simulateur fiscal PM (Personnes Morales) V1
 * Session 26
 *
 * Estimation de l'impôt dû pour une Sàrl/SA suisse.
 * IFD : 8.5% flat (art. 68 LIFD) — taux unique, sans progressivité.
 * ICC PM : barèmes cantonaux approximatifs V1 (taux effectifs globaux).
 * Impôt sur le capital : simplifié V1, taux 0.15%.
 *
 * TODO session 28+ : remplacer barèmes ICC par les taux officiels ingérés canton par canton
 * (sources : AFC VS, AFC-GE, ACI VD, SCC FR — barèmes multipliants + coefficients communaux PM)
 */

export type PmTaxEstimate = {
  benefit: number;       // bénéfice imposable après corrections CHF
  capital: number;       // capital imposable (fonds propres) CHF
  ifd: number;           // IFD 8.5% × bénéfice (art. 68 LIFD)
  icc: number;           // ICC cantonal (bénéfice) CHF
  capitalTax: number;    // impôt sur capital CHF
  total: number;         // IFD + ICC + capital
  effectiveRate: number; // total / benefit (ratio décimal, pas %)
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

/**
 * ICC PM par canton — barèmes effectifs globaux approximatifs V1.
 *
 * Ces taux représentent le taux effectif cantonal + communal combiné
 * pour une commune "type" (chef-lieu) en 2026.
 *
 * TODO session 28+ : remplacer par barèmes officiels par canton :
 *   VS : LF VS + coefficient multiplicateur communal (SCC VS)
 *   GE : LIPM (RSG D 3 09) — impôt proportionnel sur bénéfice PM
 *   VD : LI VD (BLV 642.11) — barème PM + coefficient communal
 *   FR : LICD FR (BDLF 631.1) — section PM
 *
 * Approximations V1 :
 *   VS : ~8.5% (LF VS section PM, taux cantonal ~6.5% + coefficient Sion ~130%)
 *   GE : ~14.0% (LIPM GE — taux parmi les plus élevés de Suisse)
 *   VD : ~13.5% (LI VD — taux cantonal + coeff communal moyen Lausanne)
 *   FR : ~10.0% (LICD FR — taux intermédiaire)
 */
export function estimateIccPm(
  benefit: number,
  canton: "VS" | "GE" | "VD" | "FR",
): number {
  const rates: Record<string, number> = {
    VS: 0.085,
    GE: 0.14,
    VD: 0.135,
    FR: 0.10,
  };
  const rate = rates[canton] ?? 0.10;
  return round2(Math.max(0, benefit * rate));
}

/**
 * Impôt sur le capital — simplifié V1.
 *
 * Base : fonds propres (capital social + réserves + bénéfice reporté).
 * Taux V1 : 0.15% (compromis des cantons SR — entre 0.05% et 0.30%).
 *
 * TODO session 28+ : remplacer par taux officiels par canton :
 *   VS : environ 0.15% (LF VS)
 *   GE : environ 0.24% (LIPM GE)
 *   VD : environ 0.17% (LI VD)
 *   FR : environ 0.10% (LICD FR)
 */
export function estimateCapitalTax(
  capital: number,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _canton: "VS" | "GE" | "VD" | "FR",
): number {
  // V1 : taux unique 0.15% — TODO session 28+ : taux par canton
  const rate = 0.0015;
  return round2(Math.max(0, capital * rate));
}

/**
 * Estimation complète de l'impôt PM dû (IFD + ICC + capital).
 *
 * Ordre de grandeur attendu pour bénéfice CHF 265 000 / capital CHF 100 000, canton VS :
 *   IFD = 265 000 × 8.5% = 22 525 CHF
 *   ICC VS = 265 000 × 8.5% = 22 525 CHF
 *   Capital = 100 000 × 0.15% = 150 CHF
 *   Total = ~45 200 CHF (~17.1% du bénéfice)
 */
export function estimatePmTaxDue(params: {
  canton: "VS" | "GE" | "VD" | "FR";
  year: number;
  benefit: number;   // bénéfice imposable (après corrections fiscales)
  capital: number;   // fonds propres (capital + réserves)
}): PmTaxEstimate {
  const ifd = estimateIfdPm(params.benefit);
  const icc = estimateIccPm(params.benefit, params.canton);
  const capitalTax = estimateCapitalTax(params.capital, params.canton);
  const total = round2(ifd + icc + capitalTax);

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
    disclaimer:
      "Estimation indicative basée sur les barèmes 2026 simplifiés (V1). " +
      "Le montant réel dépend des corrections fiscales exactes, de la commune, " +
      "du coefficient multiplicateur cantonal/communal et des spécificités cantonales PM. " +
      "TODO session 28+ : remplacer par barèmes officiels ingérés. " +
      "Vérifiez avec votre fiduciaire.",
  };
}
