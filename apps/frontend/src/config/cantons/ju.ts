import { COMMUNES_JU } from '@/data/communes-ju';
import { lexa } from '@/api/lexa';
import type { CantonConfig } from './types';

export const cantonJU: CantonConfig = {
  code: 'JU',
  label: 'Jura',
  communes: COMMUNES_JU.map((name) => ({ name })),
  pathPrefix: '/taxpayer/ju',
  authority: 'SCCJ',
  header: 'Déclaration d\'impôt PP Jura',
  deadlineLabel: '31 mars',
  legalBasis: 'LICD-JU (RSJU 641.11), LIFD',
  fraisProMin: 1700,
  fraisProMax: 3400,
  hasCoefficientCommunal: false,
  submitDraft: lexa.submitTaxpayerDraftJu,
};
