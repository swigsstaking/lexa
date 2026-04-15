import { COMMUNES_VD, COEFFICIENT_COMMUNAL_2026 } from '@/data/communes-vd';
import { lexa } from '@/api/lexa';
import type { CantonConfig } from './types';

export const cantonVD: CantonConfig = {
  code: 'VD',
  label: 'Vaud',
  communes: COMMUNES_VD.map((name) => ({
    name,
    coefficientCommunal: COEFFICIENT_COMMUNAL_2026[name] ?? null,
  })),
  pathPrefix: '/taxpayer/vd',
  authority: 'ACI VD',
  header: 'Déclaration d\'impôt PP Vaud',
  deadlineLabel: '15 mars',
  legalBasis: 'LI (BLV 642.11), LIPC (BLV 650.11), LIFD',
  fraisProMin: 2000,
  fraisProMax: 4000,
  hasCoefficientCommunal: true,
  submitDraft: lexa.submitTaxpayerDraftVd,
};
