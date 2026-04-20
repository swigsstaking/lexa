/** Formateur CHF 2 décimales, séparateur de milliers CH */
export function fmtMoney(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  return sign + abs.toLocaleString('fr-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Formateur compact : ≥1000 → "32.8k", sinon entier */
export function fmtCompact(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000) return sign + (abs / 1_000_000).toFixed(1).replace('.0', '') + 'M';
  if (abs >= 1000) return sign + (abs / 1000).toFixed(1).replace('.0', '') + 'k';
  return sign + abs.toFixed(0);
}
