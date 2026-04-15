// TODO (session 22): importer la vraie liste COMMUNES_FR + coefficients depuis /data/communes-fr
// Stub minimal pour permettre la route /taxpayer/fr/:year

import { lexa } from '@/api/lexa';
import type { CantonConfig, CantonCommune } from './types';

/** Liste indicative des communes FR (stub — à compléter session 22) */
const COMMUNES_FR_STUB: CantonCommune[] = [
  { name: 'Fribourg' },
  { name: 'Bulle' },
  { name: 'Romont' },
  { name: 'Estavayer-le-Lac' },
  { name: 'Châtel-Saint-Denis' },
  { name: 'Morat (Murten)' },
  { name: 'Düdingen' },
  { name: 'Villars-sur-Glâne' },
];

export const cantonFR: CantonConfig = {
  code: 'FR',
  label: 'Fribourg',
  communes: COMMUNES_FR_STUB,
  pathPrefix: '/taxpayer/fr',
  authority: 'SCC FR',
  header: 'Déclaration d\'impôt PP Fribourg',
  deadlineLabel: '31 mars',
  legalBasis: 'LICD (BDLF 631.1), LIC (BDLF 632.1), LIFD',
  fraisProMin: 1700,
  fraisProMax: 3400,
  hasCoefficientCommunal: true,
  submitDraft: lexa.submitTaxpayerDraftVd, // TODO (session 22): créer submitTaxpayerDraftFr
};
