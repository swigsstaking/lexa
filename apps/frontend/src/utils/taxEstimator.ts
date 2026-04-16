/**
 * Lexa — Simulateur fiscal frontend
 * Mis à jour Session Lane E (BUG-P2-04) — barèmes officiels S33/S36
 *
 * Utilise les mêmes barèmes que le backend (TaxScaleLoader YAML ingérés),
 * reproduits ici en JSON pour usage côté client synchrone.
 * Logique identique : getMarginalRate × revenuImposable (pas progressif par tranches).
 *
 * Cantons : VS, GE, VD, FR — PP 2026
 */

export type TaxEstimate = {
  icc: number;
  ifd: number;
  total: number;
  effectiveRate: number;
  disclaimer: string;
};

type Tranche = {
  threshold: number;
  threshold_max?: number;
  rate: number;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── Logique taux marginal (même algo que backend calcIccPpFromScale) ─────────
// Retourne le taux (décimal) applicable : dernier seuil <= revenu
function getMarginalRate(tranches: Tranche[], revenu: number): number {
  let rate = tranches[0]?.rate ?? 0;
  for (const t of tranches) {
    if (revenu >= t.threshold) {
      rate = t.rate;
    } else {
      break;
    }
  }
  return rate;
}

// ── Barème IFD 2026 ── (identique backend taxEstimator.ts — RS 642.11 Art. 36)
const IFD_BRACKETS_SINGLE: Tranche[] = [
  { threshold: 0, rate: 0 },
  { threshold: 17801, rate: 0.0077 },
  { threshold: 31601, rate: 0.0088 },
  { threshold: 41401, rate: 0.0264 },
  { threshold: 55201, rate: 0.0297 },
  { threshold: 72501, rate: 0.0594 },
  { threshold: 78101, rate: 0.0660 },
  { threshold: 103601, rate: 0.0880 },
  { threshold: 134601, rate: 0.1100 },
  { threshold: 176001, rate: 0.1320 },
  { threshold: 755201, rate: 0.1150 },
];

const IFD_BRACKETS_MARRIED: Tranche[] = [
  { threshold: 0, rate: 0 },
  { threshold: 28301, rate: 0.0100 },
  { threshold: 50901, rate: 0.0200 },
  { threshold: 58401, rate: 0.0300 },
  { threshold: 75301, rate: 0.0400 },
  { threshold: 90301, rate: 0.0500 },
  { threshold: 103401, rate: 0.0600 },
  { threshold: 114701, rate: 0.0700 },
  { threshold: 124201, rate: 0.0800 },
  { threshold: 131701, rate: 0.0900 },
  { threshold: 137301, rate: 0.1000 },
  { threshold: 141201, rate: 0.1100 },
  { threshold: 143101, rate: 0.1300 },
  { threshold: 895901, rate: 0.1150 },
];

// ── Barèmes ICC PP cantonaux (YAML baremes officiels S33/S36) ─────────────────

// VS — tarif_cantonal (LF VS Art. 32 Annexe 1) — taux marginal
// Source : vs-pp-2026.yaml — confidence: medium
const VS_TRANCHES_SINGLE: Tranche[] = [
  { threshold: 500, rate: 0.0200 },
  { threshold: 6400, rate: 0.027992 },
  { threshold: 12800, rate: 0.036915 },
  { threshold: 19100, rate: 0.045982 },
  { threshold: 25500, rate: 0.062978 },
  { threshold: 38200, rate: 0.076975 },
  { threshold: 50900, rate: 0.089974 },
  { threshold: 63600, rate: 0.104963 },
  { threshold: 76300, rate: 0.117962 },
  { threshold: 89000, rate: 0.129960 },
  { threshold: 101700, rate: 0.132989 },
  { threshold: 114400, rate: 0.134992 },
  { threshold: 127100, rate: 0.135498 },
  { threshold: 139800, rate: 0.1359 },
  { threshold: 152500, rate: 0.1364 },
  { threshold: 165200, rate: 0.1368 },
  { threshold: 190600, rate: 0.1376 },
  { threshold: 228700, rate: 0.1385 },
  { threshold: 279600, rate: 0.1392 },
  { threshold: 355900, rate: 0.1396 },
  { threshold: 457600, rate: 0.1399 },
  { threshold: 755200, rate: 0.14 },
];

// VS marié : rabais conjugal 35% (Art. 32a LF VS), min 680 CHF, max 4870 CHF
function calcVsMarried(revenuImposable: number): number {
  const base = getMarginalRate(VS_TRANCHES_SINGLE, revenuImposable) * revenuImposable;
  const reduction = Math.min(Math.max(base * 0.35, 680), 4870);
  return Math.max(0, round2(base - reduction));
}

// GE — tarif_single (LIPP Art. 41 al. 1) — taux marginal × revenu
// Source : ge-pp-2026.yaml — confidence: high
const GE_TRANCHES_SINGLE: Tranche[] = [
  { threshold: 0, rate: 0.0000 },
  { threshold: 17494, rate: 0.0730 },
  { threshold: 21077, rate: 0.0820 },
  { threshold: 23185, rate: 0.0910 },
  { threshold: 25292, rate: 0.1000 },
  { threshold: 27400, rate: 0.1090 },
  { threshold: 32669, rate: 0.1130 },
  { threshold: 36884, rate: 0.1230 },
  { threshold: 41100, rate: 0.1280 },
  { threshold: 45315, rate: 0.1320 },
  { threshold: 72714, rate: 0.1420 },
  { threshold: 119082, rate: 0.1500 },
  { threshold: 160180, rate: 0.1560 },
  { threshold: 181257, rate: 0.1580 },
  { threshold: 259239, rate: 0.1600 },
  { threshold: 276100, rate: 0.1680 },
  { threshold: 388858, rate: 0.1760 },
  { threshold: 609104, rate: 0.1800 },
];

// GE marié : splitting 50% (Art. 41 al. 2 LIPP-GE)
function calcGeMarried(revenuImposable: number): number {
  const halfRevenu = revenuImposable / 2;
  const rate = getMarginalRate(GE_TRANCHES_SINGLE, halfRevenu);
  return Math.max(0, round2(revenuImposable * rate));
}

// VD — tarif_base (LI VD Art. 47 + Art. 2 coeff) — taux marginal × revenu × coeff
// Source : vd-pp-2026.yaml — confidence: medium
// Coefficient annuel 2026 ≈ 1.55 (Art. 2 LI VD)
const VD_COEFFICIENT = 1.55;
const VD_TRANCHES: Tranche[] = [
  { threshold: 0, rate: 0.0000 },
  { threshold: 14301, rate: 0.0150 },
  { threshold: 20501, rate: 0.0230 },
  { threshold: 28101, rate: 0.0310 },
  { threshold: 35701, rate: 0.0390 },
  { threshold: 43301, rate: 0.0500 },
  { threshold: 57401, rate: 0.0600 },
  { threshold: 71601, rate: 0.0700 },
  { threshold: 85701, rate: 0.0800 },
  { threshold: 107201, rate: 0.0900 },
  { threshold: 142901, rate: 0.1000 },
  { threshold: 214301, rate: 0.1050 },
];

// FR — tarif_single (LICD RSF 631.1) — taux marginal × revenu
// Source : fr-pp-2026.yaml — confidence: medium
const FR_TRANCHES_SINGLE: Tranche[] = [
  { threshold: 0, rate: 0.0000 },
  { threshold: 13701, rate: 0.0150 },
  { threshold: 19601, rate: 0.0250 },
  { threshold: 27401, rate: 0.0340 },
  { threshold: 39201, rate: 0.0450 },
  { threshold: 56901, rate: 0.0560 },
  { threshold: 78501, rate: 0.0680 },
  { threshold: 117801, rate: 0.0790 },
  { threshold: 176701, rate: 0.0880 },
  { threshold: 294501, rate: 0.0935 },
];

// ── Estimation ICC PP (même logique que backend estimateIccWithSource) ────────

function calcIcc(
  revenuImposable: number,
  canton: string,
  civilStatus: 'single' | 'married',
): number {
  if (revenuImposable <= 0) return 0;
  switch (canton) {
    case 'VS': {
      if (civilStatus === 'married') return calcVsMarried(revenuImposable);
      return round2(getMarginalRate(VS_TRANCHES_SINGLE, revenuImposable) * revenuImposable);
    }
    case 'GE': {
      if (civilStatus === 'married') return calcGeMarried(revenuImposable);
      return round2(getMarginalRate(GE_TRANCHES_SINGLE, revenuImposable) * revenuImposable);
    }
    case 'VD': {
      const rate = getMarginalRate(VD_TRANCHES, revenuImposable);
      return round2(revenuImposable * rate * VD_COEFFICIENT);
    }
    case 'FR': {
      const rate = getMarginalRate(FR_TRANCHES_SINGLE, revenuImposable);
      return round2(revenuImposable * rate);
    }
    default:
      return 0;
  }
}

// ── Estimation IFD 2026 (Art. 36 LIFD) ───────────────────────────────────────
// Utilise la même logique getMarginalRate (cohérence avec backend)

function calcIfd(
  revenuImposable: number,
  civilStatus: 'single' | 'married',
): number {
  if (revenuImposable <= 0) return 0;
  const brackets = civilStatus === 'married' ? IFD_BRACKETS_MARRIED : IFD_BRACKETS_SINGLE;
  return round2(getMarginalRate(brackets, revenuImposable) * revenuImposable);
}

// ── Export principal ──────────────────────────────────────────────────────────

export function estimateTaxDue(params: {
  canton: string;
  revenuImposable: number;
  civilStatus?: 'single' | 'married';
}): TaxEstimate | null {
  const { canton, revenuImposable, civilStatus = 'single' } = params;
  if (revenuImposable <= 0) return null;

  const icc = calcIcc(revenuImposable, canton, civilStatus);
  const ifd = calcIfd(revenuImposable, civilStatus);
  const total = round2(icc + ifd);

  return {
    icc,
    ifd,
    total,
    effectiveRate: round2(total / revenuImposable),
    disclaimer:
      'Estimation indicative — barèmes officiels S33/S36 (taux marginal, mêmes données que PDF). ' +
      'Le montant exact dépend de votre commune, déductions additionnelles et règles cantonales. ' +
      'Vérifiez avec votre fiduciaire.',
  };
}
