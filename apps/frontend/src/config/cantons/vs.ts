import { COMMUNES_VS } from '@/data/communes-vs';
import { lexa } from '@/api/lexa';
import type { CantonConfig } from './types';

export const cantonVS: CantonConfig = {
  code: 'VS',
  label: 'Valais',
  communes: COMMUNES_VS.map((name) => ({ name })),
  // VS utilise /taxpayer/:year (route legacy sans préfixe canton)
  pathPrefix: '/taxpayer',
  authority: 'SCC VS',
  header: 'Déclaration d\'impôt PP Valais',
  deadlineLabel: '31 mars',
  legalBasis: 'LIFD art. 33 al. 1 let. e, LICD VS (RS VS 642.1)',
  fraisProMin: 1700,
  fraisProMax: 3400,
  hasCoefficientCommunal: false,
  submitDraft: lexa.submitTaxpayerDraft,
};
