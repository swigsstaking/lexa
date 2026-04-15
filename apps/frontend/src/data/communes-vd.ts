/**
 * Communes vaudoises prioritaires (v1 session 19).
 * Les 15 communes les plus peuplées du canton de Vaud.
 * Source : statistique vd.ch — population 2026.
 *
 * Coefficient communal 2026 :
 * - Lausanne : 79 (TODO à valider barème 2026 — source : vd.ch ou lausanne.ch/impots)
 * - Autres communes : null → l'UI affiche "coefficient à saisir manuellement"
 */
export const COMMUNES_VD = [
  'Lausanne',
  'Yverdon-les-Bains',
  'Montreux',
  'Renens',
  'Nyon',
  'Pully',
  'Prilly',
  'Morges',
  'Gland',
  'La Tour-de-Peilz',
  'Vevey',
  'Ecublens',
  'Le Mont-sur-Lausanne',
  'Epalinges',
  'Crissier',
] as const;

export type CommuneVd = (typeof COMMUNES_VD)[number];

/**
 * Coefficient communal 2026 par commune.
 * Lausanne = 79 (TODO à valider barème 2026).
 * Autres communes = null → saisie manuelle requise.
 */
export const COEFFICIENT_COMMUNAL_2026: Record<CommuneVd, number | null> = {
  Lausanne: 79, // TODO à valider barème 2026 (source : vd.ch ou lausanne.ch/impots)
  'Yverdon-les-Bains': null,
  Montreux: null,
  Renens: null,
  Nyon: null,
  Pully: null,
  Prilly: null,
  Morges: null,
  Gland: null,
  'La Tour-de-Peilz': null,
  Vevey: null,
  Ecublens: null,
  'Le Mont-sur-Lausanne': null,
  Epalinges: null,
  Crissier: null,
};
