/**
 * Lexa — Simulateur fiscal V1 (frontend)
 * Session 22 (Lane A)
 *
 * Clone client-side du taxEstimator backend.
 * Barèmes tabulés simplifiés 2026 pour VS, GE, VD, FR.
 *
 * TODO session 23+ : remplacer par appel API avec barèmes officiels ingérés
 */

export type TaxEstimate = {
  icc: number;
  ifd: number;
  total: number;
  effectiveRate: number;
  disclaimer: string;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

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
  if (remaining > 0) {
    const lastRate = brackets[brackets.length - 1].rate;
    tax += remaining * (lastRate / 100);
  }
  return round2(tax);
}

// ── IFD 2026 ──────────────────────────────────────────────────────────────────
const IFD_BRACKETS_SINGLE = [
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

const IFD_BRACKETS_MARRIED = [
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

// ── Barèmes cantonaux ─────────────────────────────────────────────────────────
const ICC_BRACKETS: Record<string, {
  single: Array<{ max: number; rate: number }>;
  married: Array<{ max: number; rate: number }>;
}> = {
  VS: {
    single: [
      { max: 11000, rate: 0 }, { max: 16000, rate: 1.5 }, { max: 22000, rate: 3.0 },
      { max: 32000, rate: 4.5 }, { max: 45000, rate: 6.0 }, { max: 70000, rate: 7.5 },
      { max: 100000, rate: 9.0 }, { max: 150000, rate: 11.0 }, { max: 250000, rate: 12.5 },
      { max: Infinity, rate: 14.0 },
    ],
    married: [
      { max: 14000, rate: 0 }, { max: 20000, rate: 1.0 }, { max: 28000, rate: 2.5 },
      { max: 40000, rate: 4.0 }, { max: 60000, rate: 5.5 }, { max: 90000, rate: 7.0 },
      { max: 130000, rate: 9.0 }, { max: 200000, rate: 11.0 }, { max: Infinity, rate: 13.0 },
    ],
  },
  GE: {
    single: [
      { max: 16100, rate: 0 }, { max: 22200, rate: 3.0 }, { max: 29300, rate: 5.0 },
      { max: 37900, rate: 7.0 }, { max: 47000, rate: 9.0 }, { max: 57500, rate: 11.0 },
      { max: 70000, rate: 13.0 }, { max: 85000, rate: 15.0 }, { max: 110000, rate: 17.0 },
      { max: 150000, rate: 18.0 }, { max: Infinity, rate: 19.0 },
    ],
    married: [
      { max: 23800, rate: 0 }, { max: 32000, rate: 2.5 }, { max: 44000, rate: 5.0 },
      { max: 58000, rate: 7.5 }, { max: 76000, rate: 10.0 }, { max: 100000, rate: 13.0 },
      { max: 140000, rate: 16.0 }, { max: Infinity, rate: 17.5 },
    ],
  },
  VD: {
    single: [
      { max: 13600, rate: 0 }, { max: 22700, rate: 1.5 }, { max: 32000, rate: 3.0 },
      { max: 44700, rate: 4.5 }, { max: 61800, rate: 6.0 }, { max: 86600, rate: 7.5 },
      { max: 120600, rate: 9.0 }, { max: 174600, rate: 11.0 }, { max: Infinity, rate: 15.5 },
    ],
    married: [
      { max: 18700, rate: 0 }, { max: 31200, rate: 1.5 }, { max: 44500, rate: 3.0 },
      { max: 61800, rate: 5.0 }, { max: 87900, rate: 7.0 }, { max: 125500, rate: 9.0 },
      { max: Infinity, rate: 13.5 },
    ],
  },
  FR: {
    single: [
      { max: 12600, rate: 0 }, { max: 18900, rate: 2.0 }, { max: 27200, rate: 3.5 },
      { max: 39500, rate: 5.0 }, { max: 56000, rate: 6.5 }, { max: 80000, rate: 8.0 },
      { max: 115000, rate: 9.5 }, { max: 165000, rate: 11.0 }, { max: Infinity, rate: 13.5 },
    ],
    married: [
      { max: 18200, rate: 0 }, { max: 28000, rate: 1.5 }, { max: 40000, rate: 3.0 },
      { max: 58000, rate: 5.0 }, { max: 82000, rate: 7.0 }, { max: 120000, rate: 9.0 },
      { max: Infinity, rate: 12.0 },
    ],
  },
};

export function estimateTaxDue(params: {
  canton: string;
  revenuImposable: number;
  civilStatus?: 'single' | 'married';
}): TaxEstimate | null {
  const { canton, revenuImposable, civilStatus = 'single' } = params;
  if (revenuImposable <= 0) return null;

  const ifdBrackets = civilStatus === 'married' ? IFD_BRACKETS_MARRIED : IFD_BRACKETS_SINGLE;
  const ifd = progressiveTax(revenuImposable, ifdBrackets);

  const cantonBrackets = ICC_BRACKETS[canton];
  if (!cantonBrackets) return null;
  const icc = progressiveTax(
    revenuImposable,
    civilStatus === 'married' ? cantonBrackets.married : cantonBrackets.single,
  );

  const total = round2(ifd + icc);

  return {
    icc: round2(icc),
    ifd: round2(ifd),
    total,
    effectiveRate: round2(total / revenuImposable),
    disclaimer:
      'Estimation indicative — barèmes 2026 simplifiés. ' +
      'Le montant réel dépend de votre commune et des règles cantonales fines. ' +
      'Vérifiez avec votre fiduciaire.',
  };
}
