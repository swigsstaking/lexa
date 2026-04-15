// Communes FR réelles — ordre population décroissante (sources: Office fédéral de la statistique 2024)
// Coefficient communal : null pour toutes — saisie manuelle requise
// TODO session 23 : ingérer le barème communal FR 2026 depuis SCC FR (coefficients officiels)

export type CommuneFR = {
  name: string;
  coefficientCommunal: null; // FR utilise un autre système — pas de coefficient communal public 2026 ingéré
};

export const COMMUNES_FR: CommuneFR[] = [
  { name: 'Fribourg', coefficientCommunal: null },
  { name: 'Bulle', coefficientCommunal: null },
  { name: 'Villars-sur-Glâne', coefficientCommunal: null },
  { name: 'Marly', coefficientCommunal: null },
  { name: 'Estavayer', coefficientCommunal: null },
  { name: 'Morat', coefficientCommunal: null },
  { name: 'Düdingen', coefficientCommunal: null },      // commune germanophone
  { name: 'Tafers', coefficientCommunal: null },         // commune germanophone
  { name: 'Romont', coefficientCommunal: null },
  { name: 'Châtel-St-Denis', coefficientCommunal: null },
  { name: 'Belfaux', coefficientCommunal: null },
  { name: 'Givisiez', coefficientCommunal: null },
  { name: 'Granges-Paccot', coefficientCommunal: null },
  { name: 'Le Mouret', coefficientCommunal: null },
  { name: 'Courtepin', coefficientCommunal: null },
];

export const COMMUNES_FR_NAMES: string[] = COMMUNES_FR.map((c) => c.name);
