/**
 * Communes valaisannes prioritaires (v1 session 15).
 * Les 25 communes les plus peuplées du canton du Valais.
 * Session 16+ : extraction complète depuis le registre BFS (126 communes).
 */

export const COMMUNES_VS = [
  'Sion',
  'Martigny',
  'Monthey',
  'Sierre',
  'Brigue-Glis',
  'Conthey',
  'Collombey-Muraz',
  'Bagnes',
  'Naters',
  'Viège',
  'Fully',
  'Savièse',
  'Vétroz',
  'Saint-Maurice',
  'Chamoson',
  'Loèche',
  'Leytron',
  'Nendaz',
  'Ayent',
  'Salvan',
  'Sembrancher',
  'Orsières',
  'Zermatt',
  'Crans-Montana',
  'Val-d\'Illiez',
] as const;

export type CommuneVs = (typeof COMMUNES_VS)[number];
