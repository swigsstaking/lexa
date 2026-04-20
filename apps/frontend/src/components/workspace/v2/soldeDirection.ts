/**
 * soldeDirection — helper comptable
 * Convention Käfer :
 *   Actifs (1xxx) & Charges (4-9xxx) = solde normalement DÉBITEUR (↑)
 *   Passifs (2xxx) & Produits (3xxx) = solde normalement CRÉDITEUR (↓)
 */

export type AccountClass = 'A' | 'L' | 'P' | 'C';

export interface SoldeInfo {
  side: 'D' | 'C';
  abs: number;
  anormal: boolean;
}

export function soldeDirection(cls: AccountClass, balance: number): SoldeInfo {
  const normalSide: 'D' | 'C' = cls === 'A' || cls === 'C' ? 'D' : 'C';
  let side: 'D' | 'C';
  if (balance < 0) side = 'C';
  else if (balance > 0) side = 'D';
  else side = normalSide;

  return {
    side,
    abs: Math.abs(balance),
    anormal: balance !== 0 && side !== normalSide,
  };
}

/**
 * Détermine la classe Käfer depuis le code de compte Lexa.
 * Le champ `account` de l'API Lexa contient le code sous forme "1020 - Banque" ou juste "1020".
 */
export function classFromCode(account: string): AccountClass {
  const match = account.match(/^(\d+)/);
  if (!match) return 'C';
  const first = match[1][0];
  if (first === '1') return 'A';
  if (first === '2') return 'L';
  if (first === '3') return 'P';
  return 'C'; // 4–9
}

/** Extrait le code numérique depuis le champ `account` ("1020 - Banque" → "1020") */
export function extractCode(account: string): string {
  return account.match(/^(\d+)/)?.[1] ?? account;
}

/** Extrait le nom depuis le champ `account` ("1020 - Banque" → "Banque") */
export function extractName(account: string): string {
  const m = account.match(/^\d+\s*[-–]\s*(.+)$/);
  if (m) return m[1].trim();
  // Si pas de séparateur, retourner tout sans le code
  const stripped = account.replace(/^\d+\s*/, '');
  return stripped || account;
}
