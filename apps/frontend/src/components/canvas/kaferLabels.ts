/**
 * Mapping codes plan comptable PME Käfer → libellés FR courants.
 * Source : plan comptable PME suisse standard (pas exhaustif, couvre les
 * comptes les plus utilisés). Fallback quand l'API retourne juste le code.
 */
export const KAFER_LABELS: Record<string, string> = {
  // Classe 1 — Actifs
  '1000': 'Caisse',
  '1010': 'Postfinance',
  '1020': 'Banque',
  '1100': 'Clients',
  '1140': 'Avances et prêts',
  '1170': 'Impôt préalable TVA',
  '1176': 'Impôt préalable sur acquisition',
  '1200': 'Stocks marchandises',
  '1300': 'Actifs de régularisation',
  '1400': 'Immobilisations financières',
  '1500': 'Machines et équipements',
  '1510': 'Mobilier de bureau',
  '1520': 'Machines de bureau',
  '1530': 'Véhicules',
  '1600': 'Immeubles',
  '1700': 'Immobilisations incorporelles',
  '1770': 'Goodwill',

  // Classe 2 — Passifs
  '2000': 'Fournisseurs',
  '2100': 'Dettes CT financières',
  '2200': 'TVA due',
  '2201': 'TVA à récupérer',
  '2210': 'Autres dettes CT',
  '2300': 'Passifs de régularisation',
  '2400': 'Dettes LT financières',
  '2500': 'Autres dettes LT',
  '2600': 'Provisions',
  '2800': 'Capital social',
  '2900': 'Réserves',
  '2970': 'Bénéfice reporté',

  // Classe 3 — Produits
  '3000': 'Ventes produits',
  '3200': 'Ventes prestations',
  '3400': 'Ventes autres',
  '3600': 'Autres produits exploitation',
  '3700': 'Produits accessoires',
  '3800': 'Diminutions de produits',
  '3900': 'Variations stocks produits',

  // Classe 4 — Charges matières
  '4000': 'Achats marchandises',
  '4200': 'Achats prestations',
  '4500': 'Frais annexes achats',
  '4900': 'Variations stocks matières',

  // Classe 5 — Charges personnel
  '5000': 'Salaires',
  '5100': 'Indemnités',
  '5200': 'AVS/AI/APG/AC',
  '5270': 'LPP',
  '5280': 'Assurances accidents',
  '5700': 'Formation personnel',
  '5800': 'Autres charges personnel',
  '5900': 'Frais personnel divers',

  // Classe 6 — Autres charges exploitation
  '6000': 'Loyer',
  '6100': 'Entretien immobilier',
  '6200': 'Entretien véhicules',
  '6300': 'Assurances',
  '6400': 'Énergie',
  '6500': 'Frais administratifs',
  '6510': 'Téléphone / Internet',
  '6600': 'Publicité',
  '6700': 'Honoraires',
  '6800': 'Amortissements',
  '6900': 'Charges financières',

  // Classe 7 — Résultat immobilier
  '7000': 'Produits immeubles',
  '7500': 'Charges immeubles',

  // Classe 8 — Résultat extraordinaire
  '8000': 'Résultat extraordinaire',
  '8500': 'Charges extraordinaires',

  // Classe 9 — Impôts
  '9000': 'Impôts',
  '9200': 'Impôts sur le bénéfice',
};

/**
 * Retourne le libellé d'un compte Käfer.
 * Priorité : label fourni non-numérique > mapping KAFER_LABELS > fallback "Compte {code}"
 */
export function accountDisplayLabel(code: string, providedLabel?: string): string {
  // Si l'API fournit un vrai libellé (pas juste le code), on le garde
  if (providedLabel && providedLabel.trim() && !/^\d+$/.test(providedLabel.trim())) {
    return providedLabel;
  }
  // Sinon lookup dans le mapping
  return KAFER_LABELS[code] ?? `Compte ${code}`;
}
