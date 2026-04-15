/**
 * Communes genevoises prioritaires (v1 session 17).
 * Les 8 communes les plus peuplées du canton de Genève.
 * Source : SIL-GE data.
 */
export const COMMUNES_GE = [
  'Genève',
  'Vernier',
  'Lancy',
  'Meyrin',
  'Carouge',
  'Onex',
  'Thônex',
  'Versoix',
] as const;

export type CommuneGe = (typeof COMMUNES_GE)[number];
