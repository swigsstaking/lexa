import { COMMUNES_BJ } from '@/data/communes-bj';
import { lexa } from '@/api/lexa';
import type { CantonConfig } from './types';

// BJ = Jura bernois (partie francophone du canton de Berne)
// Autorité : Administration fiscale du canton de Berne (ADB), section francophone
export const cantonBJ: CantonConfig = {
  code: 'BJ',
  label: 'Jura bernois',
  communes: COMMUNES_BJ.map((name) => ({ name })),
  pathPrefix: '/taxpayer/bj',
  authority: 'ADB (section francophone)',
  header: 'Déclaration d\'impôt PP Jura bernois',
  deadlineLabel: '31 mars',
  legalBasis: 'LICD-BE (RSB 661.11), OFP-BE (RSB 661.312), LIFD',
  fraisProMin: 1700,
  fraisProMax: 3400,
  hasCoefficientCommunal: false,
  submitDraft: lexa.submitTaxpayerDraftBj,
};
