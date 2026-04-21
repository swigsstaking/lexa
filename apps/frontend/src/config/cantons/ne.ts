import { COMMUNES_NE } from '@/data/communes-ne';
import { lexa } from '@/api/lexa';
import type { CantonConfig } from './types';

export const cantonNE: CantonConfig = {
  code: 'NE',
  label: 'Neuchâtel',
  communes: COMMUNES_NE.map((name) => ({ name })),
  pathPrefix: '/taxpayer/ne',
  authority: 'SCCO NE',
  header: 'Déclaration d\'impôt PP Neuchâtel',
  deadlineLabel: '31 mars',
  legalBasis: 'LCdir-NE (RSN 631.0), RGI-NE (RSN 631.01), LIFD',
  fraisProMin: 1700,
  fraisProMax: 3400,
  hasCoefficientCommunal: false,
  submitDraft: lexa.submitTaxpayerDraftNe,
};
