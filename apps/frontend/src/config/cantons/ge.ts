import { COMMUNES_GE } from '@/data/communes-ge';
import { lexa } from '@/api/lexa';
import type { CantonConfig } from './types';

export const cantonGE: CantonConfig = {
  code: 'GE',
  label: 'Genève',
  communes: COMMUNES_GE.map((name) => ({ name })),
  pathPrefix: '/taxpayer/ge',
  authority: 'AFC-GE',
  header: 'Déclaration d\'impôt PP Genève',
  deadlineLabel: '31 mars',
  legalBasis: 'LIFD art. 33, LIPP (RSG D 3 08)',
  fraisProMin: 1700,
  fraisProMax: 4000,
  hasCoefficientCommunal: false,
  submitDraft: lexa.submitTaxpayerDraftGe,
};
