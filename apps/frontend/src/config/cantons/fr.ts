import { COMMUNES_FR } from '@/data/communes-fr';
import { lexa } from '@/api/lexa';
import type { CantonConfig } from './types';

export const cantonFR: CantonConfig = {
  code: 'FR',
  label: 'Fribourg',
  communes: COMMUNES_FR.map((c) => ({ name: c.name, coefficientCommunal: null })),
  pathPrefix: '/taxpayer/fr',
  authority: 'SCC FR',
  header: 'Déclaration d\'impôt PP Fribourg',
  deadlineLabel: '31 mars',
  legalBasis: 'LICD (BDLF 631.1), LIC (BDLF 632.1), ORD-FP (BDLF 631.411), LIFD',
  fraisProMin: 1700,
  fraisProMax: 3400,
  // FR n'utilise pas de coefficient communal par commune dans le wizard
  hasCoefficientCommunal: false,
  submitDraft: lexa.submitTaxpayerDraftFr,
};
