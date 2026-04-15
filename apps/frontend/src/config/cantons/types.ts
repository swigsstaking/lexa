/**
 * Types génériques pour la configuration par canton.
 * GE + VD : implémentés en session 21.
 * VS : legacy (TaxpayerWizard.tsx), harmonisation session 22.
 * FR : stub déclaré pour session 22.
 */

export type CantonCode = 'GE' | 'VD' | 'VS' | 'FR';

export interface CantonCommune {
  name: string;
  /** Coefficient communal en % (VD). null = à saisir manuellement. */
  coefficientCommunal?: number | null;
}

export interface CantonConfig {
  code: CantonCode;
  /** Nom complet du canton, ex. "Genève", "Vaud" */
  label: string;
  communes: CantonCommune[];
  /** Chemin de route de base, ex. "/taxpayer/ge" */
  pathPrefix: string;
  /** Autorité cantonale, ex. "AFC-GE", "ACI VD" */
  authority: string;
  /** Titre dans le header du wizard */
  header: string;
  /** Délai de dépôt affiché, ex. "31 mars", "15 mars" */
  deadlineLabel: string;
  /** Texte de base légale affichée dans les disclaimers */
  legalBasis: string;
  /** Min forfait frais professionnels (CHF) */
  fraisProMin: number;
  /** Max forfait frais professionnels (CHF) */
  fraisProMax: number;
  /** Le canton a un coefficient communal variable par commune (VD: true, GE: false) */
  hasCoefficientCommunal: boolean;
  /** Fonctions de soumission du brouillon */
  submitDraft: (input: { fiscalYear: number }) => Promise<unknown>;
}
