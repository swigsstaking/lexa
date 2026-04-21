#!/usr/bin/env node
/**
 * ingest-kafer — Ingère le plan comptable PME suisse (Käfer) dans Qdrant.
 *
 * Exécution (depuis apps/backend/) :
 *   npx tsx src/scripts/ingest-kafer.ts
 *   QDRANT_URL=http://192.168.110.103:6333 EMBEDDER_URL=http://192.168.110.103:8001 npx tsx src/scripts/ingest-kafer.ts
 *
 * Stratégie :
 *   - Supprime d'abord les points existants avec law="Plan-Kafer" (idempotent)
 *   - Génère un point par compte avec payload canonique QdrantHit-compatible
 *   - Embedde via BGE-M3 (llama-server 8082 ou 8001 selon EMBEDDER_URL)
 */

import axios from "axios";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Config (env overrides + defaults pointant vers le Spark)
// ---------------------------------------------------------------------------

const QDRANT_URL = process.env.QDRANT_URL ?? "http://192.168.110.103:6333";
const EMBEDDER_URL = process.env.EMBEDDER_URL ?? "http://192.168.110.103:8001";
const COLLECTION = process.env.QDRANT_COLLECTION ?? "swiss_law";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AccountType =
  | "balance_sheet_asset"
  | "balance_sheet_liability"
  | "equity"
  | "revenue"
  | "revenue_adjustment"
  | "expense"
  | "expense_adjustment"
  | "closing";

interface KaeferAccount {
  id: string;
  label: string;
  class: number;
  classLabel: string;
  type: AccountType;
  nature?: string;
  description?: string;
  defaultTvaRate?: number;
  defaultTvaCode?: string;
  depreciationRateAfc?: number;
  source?: string;
}

interface QdrantPayload {
  text: string;
  law: string;
  law_label: string;
  article: string;
  article_num: string;
  heading: string;
  rs: null;
  topic: string;
  category: string;
  account_class: number;
  account_nature?: string;
  default_tva_rate?: number;
  default_tva_code?: string;
  depreciation_rate_afc?: number;
  date_version: string;
  source: string;
  jurisdiction: string;
}

// ---------------------------------------------------------------------------
// Plan Käfer PME suisse — données hardcodées (source: Käfer / Swiss GAAP RPC)
// ---------------------------------------------------------------------------

const CLASS_LABELS: Record<number, string> = {
  1: "Actifs",
  2: "Passifs",
  3: "Produits d'exploitation",
  4: "Charges de matériel et de marchandises",
  5: "Charges de personnel",
  6: "Autres charges d'exploitation",
  7: "Résultat accessoire",
  8: "Résultat extraordinaire, unique, hors exploitation",
  9: "Clôture et résultat",
};

const ACCOUNTS: KaeferAccount[] = [
  // ── Classe 1 — Actifs ──────────────────────────────────────────────────
  {
    id: "1000", label: "Caisse", class: 1, classLabel: CLASS_LABELS[1],
    type: "balance_sheet_asset", nature: "liquid",
    description: "Espèces en caisse (CHF, devises). Actif liquide par excellence.",
  },
  {
    id: "1020", label: "Banque — compte courant", class: 1, classLabel: CLASS_LABELS[1],
    type: "balance_sheet_asset", nature: "liquid",
    description: "Comptes courants auprès des banques. Réconciliation mensuelle obligatoire.",
  },
  {
    id: "1021", label: "Compte de virement postal", class: 1, classLabel: CLASS_LABELS[1],
    type: "balance_sheet_asset", nature: "liquid",
    description: "Compte postal (CCP). Equivalent fonctionnel du compte bancaire courant.",
  },
  {
    id: "1060", label: "Titres et placements financiers à court terme", class: 1, classLabel: CLASS_LABELS[1],
    type: "balance_sheet_asset", nature: "investment",
    description: "Placements liquides à court terme: actions, obligations, fonds de placement.",
  },
  {
    id: "1100", label: "Créances clients (débiteurs)", class: 1, classLabel: CLASS_LABELS[1],
    type: "balance_sheet_asset", nature: "receivable",
    description: "Créances sur ventes, facturées mais non encore encaissées. Délai habituel 30-90 jours.",
  },
  {
    id: "1109", label: "Ducroire", class: 1, classLabel: CLASS_LABELS[1],
    type: "balance_sheet_asset", nature: "valuation_adjustment",
    description: "Provision pour créances douteuses. Taux forfaitaire admis AFC: 5% créances suisses, 10% étrangères.",
  },
  {
    id: "1170", label: "Impôt préalable TVA (biens et services)", class: 1, classLabel: CLASS_LABELS[1],
    type: "balance_sheet_asset", nature: "tax",
    defaultTvaRate: 8.1, defaultTvaCode: "TVA-8.1-deductible",
    description: "TVA payée en amont récupérable sur biens et services (Art. 28 LTVA). Déductible si activité imposable.",
  },
  {
    id: "1171", label: "Impôt préalable TVA (investissements)", class: 1, classLabel: CLASS_LABELS[1],
    type: "balance_sheet_asset", nature: "tax",
    defaultTvaRate: 8.1,
    description: "TVA déductible sur investissements et biens d'investissement (Art. 28 ss LTVA). Correction si usage mixte.",
  },
  {
    id: "1200", label: "Stock de marchandises", class: 1, classLabel: CLASS_LABELS[1],
    type: "balance_sheet_asset", nature: "inventory",
    description: "Marchandises destinées à la revente. Évaluation au coût d'acquisition ou valeur marchande si inférieure (principe de prudence).",
  },
  {
    id: "1210", label: "Stock de matières premières", class: 1, classLabel: CLASS_LABELS[1],
    type: "balance_sheet_asset", nature: "inventory",
    description: "Matières premières destinées à la production. Inventaire obligatoire à la clôture.",
  },
  {
    id: "1280", label: "Travaux en cours", class: 1, classLabel: CLASS_LABELS[1],
    type: "balance_sheet_asset", nature: "inventory",
    description: "Travaux partiellement achevés non encore facturés. Valorisation au coût de production.",
  },
  {
    id: "1300", label: "Actifs de régularisation", class: 1, classLabel: CLASS_LABELS[1],
    type: "balance_sheet_asset", nature: "accrual",
    description: "Charges payées d'avance et produits à recevoir. Rattachement à l'exercice concerné (principe de délimitation temporelle).",
  },
  {
    id: "1400", label: "Immobilisations financières", class: 1, classLabel: CLASS_LABELS[1],
    type: "balance_sheet_asset", nature: "fixed_asset",
    description: "Participations, prêts à long terme, cautionnements. Évaluation au coût d'acquisition moins dépréciations.",
  },
  {
    id: "1500", label: "Machines et appareils", class: 1, classLabel: CLASS_LABELS[1],
    type: "balance_sheet_asset", nature: "fixed_asset",
    depreciationRateAfc: 30,
    source: "Notice A/1995 AFC — entreprises commerciales",
    description: "Machines et appareils de production. Taux d'amortissement AFC maximal 30% sur valeur résiduelle (Notice A/1995).",
  },
  {
    id: "1510", label: "Mobilier et installations d'exploitation", class: 1, classLabel: CLASS_LABELS[1],
    type: "balance_sheet_asset", nature: "fixed_asset",
    depreciationRateAfc: 25,
    description: "Mobilier, agencements, installations fixes. Amortissement linéaire ou dégressif, taux AFC max 25%.",
  },
  {
    id: "1520", label: "Matériel informatique (hardware)", class: 1, classLabel: CLASS_LABELS[1],
    type: "balance_sheet_asset", nature: "fixed_asset",
    depreciationRateAfc: 40,
    source: "Notice A/1995 AFC",
    description: "Ordinateurs, serveurs, périphériques. Taux AFC 40% sur valeur résiduelle. Durée de vie typique 3-5 ans.",
  },
  {
    id: "1521", label: "Logiciels et licences", class: 1, classLabel: CLASS_LABELS[1],
    type: "balance_sheet_asset", nature: "intangible",
    depreciationRateAfc: 40,
    description: "Logiciels, licences d'exploitation, développements informatiques capitalisés. Amortissement sur durée d'utilité, max 5 ans.",
  },
  {
    id: "1530", label: "Véhicules d'entreprise", class: 1, classLabel: CLASS_LABELS[1],
    type: "balance_sheet_asset", nature: "fixed_asset",
    depreciationRateAfc: 40,
    source: "Notice A/1995 AFC",
    description: "Voitures de tourisme, véhicules utilitaires. Taux AFC max 40% dégressif. Pour véhicules de luxe: voir Circ. 34 AFC (correction prestation appréciable en argent si usage privé).",
  },
  {
    id: "1600", label: "Immeubles d'exploitation", class: 1, classLabel: CLASS_LABELS[1],
    type: "balance_sheet_asset", nature: "fixed_asset",
    depreciationRateAfc: 7,
    description: "Bâtiments commerciaux propres. Taux AFC moyen 7% dégressif sur valeur résiduelle. Terrain non amortissable.",
  },
  {
    id: "1700", label: "Droits et immobilisations incorporelles", class: 1, classLabel: CLASS_LABELS[1],
    type: "balance_sheet_asset", nature: "intangible",
    description: "Brevets, marques, droits d'auteur, goodwill. Amortissement sur durée d'utilité (max 5 ans goodwill selon OR Art. 960a).",
  },

  // ── Classe 2 — Passifs ─────────────────────────────────────────────────
  {
    id: "2000", label: "Créanciers fournisseurs", class: 2, classLabel: CLASS_LABELS[2],
    type: "balance_sheet_liability", nature: "payable",
    description: "Dettes commerciales envers fournisseurs. Délai habituel 30-60 jours. Passif à court terme.",
  },
  {
    id: "2030", label: "Acomptes de clients", class: 2, classLabel: CLASS_LABELS[2],
    type: "balance_sheet_liability", nature: "payable",
    description: "Avances reçues avant livraison ou prestation. TVA exigible dès réception de l'acompte (Art. 40 al. 1 LTVA).",
  },
  {
    id: "2100", label: "Dettes bancaires à court terme", class: 2, classLabel: CLASS_LABELS[2],
    type: "balance_sheet_liability", nature: "debt",
    description: "Crédits bancaires remboursables dans les 12 mois: crédits de caisse, lignes de crédit. Intérêts en classe 6.",
  },
  {
    id: "2200", label: "TVA due (décompte AFC)", class: 2, classLabel: CLASS_LABELS[2],
    type: "balance_sheet_liability", nature: "tax",
    description: "TVA collectée à reverser à l'AFC. Solde entre TVA sur ventes et impôt préalable (Art. 86 LTVA). Décompte trimestriel ou semestriel.",
  },
  {
    id: "2201", label: "Décompte TVA — compte courant AFC", class: 2, classLabel: CLASS_LABELS[2],
    type: "balance_sheet_liability", nature: "tax",
    description: "Compte intermédiaire pour réconciliation TVA. Solde = montant dû ou à récupérer auprès de l'AFC.",
  },
  {
    id: "2206", label: "Acomptes reçus pour TVA", class: 2, classLabel: CLASS_LABELS[2],
    type: "balance_sheet_liability", nature: "tax",
    description: "Acomptes TVA versés à l'AFC en cours d'exercice (méthode des acomptes). Solde à régulariser au décompte final.",
  },
  {
    id: "2270", label: "Impôts directs dus (IFD, ICC)", class: 2, classLabel: CLASS_LABELS[2],
    type: "balance_sheet_liability", nature: "tax",
    description: "Impôt fédéral direct et cantonal/communal à payer. Provision calculée sur bénéfice imposable estimé. Non déductible (Art. 59 al. 1 let. a LIFD).",
  },
  {
    id: "2300", label: "Emprunts à long terme", class: 2, classLabel: CLASS_LABELS[2],
    type: "balance_sheet_liability", nature: "debt",
    description: "Dettes financières à plus d'un an: hypothèques, obligations, prêts actionnaires. Intérêts en classe 6800.",
  },
  {
    id: "2400", label: "Passifs de régularisation", class: 2, classLabel: CLASS_LABELS[2],
    type: "balance_sheet_liability", nature: "accrual",
    description: "Charges à payer et produits reçus d'avance. Principe de délimitation temporelle (OR Art. 959a).",
  },
  {
    id: "2600", label: "Provisions", class: 2, classLabel: CLASS_LABELS[2],
    type: "balance_sheet_liability", nature: "provision",
    description: "Provisions justifiées par l'usage commercial: garanties, litiges, restructurations. Déductibles fiscalement si vraisemblables et calculables (Art. 63 LIFD).",
  },
  {
    id: "2800", label: "Capital social (capital-actions / parts Sàrl)", class: 2, classLabel: CLASS_LABELS[2],
    type: "equity", nature: "capital",
    description: "Capital libéré inscrit au RC. SA: min CHF 100'000 (Art. 621 CO). Sàrl: min CHF 20'000 (Art. 773 CO). Réduction soumise à formalités légales.",
  },
  {
    id: "2900", label: "Réserves générales légales", class: 2, classLabel: CLASS_LABELS[2],
    type: "equity", nature: "reserve",
    description: "Réserve légale obligatoire: 5% du bénéfice annuel jusqu'à 20% du capital (Art. 671 CO SA). Affectation protégée.",
  },
  {
    id: "2950", label: "Réserves libres / facultatives", class: 2, classLabel: CLASS_LABELS[2],
    type: "equity", nature: "reserve",
    description: "Réserves discrétionnaires constituées par l'assemblée générale. Libres d'affectation (Art. 674 CO).",
  },
  {
    id: "2970", label: "Bénéfice (perte) reporté", class: 2, classLabel: CLASS_LABELS[2],
    type: "equity", nature: "retained_earnings",
    description: "Résultats antérieurs non distribués ni affectés en réserves. Cumulé sur plusieurs exercices.",
  },
  {
    id: "2979", label: "Bénéfice (perte) de l'exercice", class: 2, classLabel: CLASS_LABELS[2],
    type: "equity", nature: "current_result",
    description: "Résultat net de l'exercice en cours avant affectation. Transféré en 2970 après approbation des comptes.",
  },

  // ── Classe 3 — Produits ────────────────────────────────────────────────
  {
    id: "3000", label: "Ventes de marchandises", class: 3, classLabel: CLASS_LABELS[3],
    type: "revenue",
    defaultTvaRate: 8.1, defaultTvaCode: "TVA-8.1-standard",
    description: "Chiffre d'affaires ventes marchandises. Taux TVA standard 8.1% (dès 01.01.2024). Comptabilisation HT avec TVA en 2200.",
  },
  {
    id: "3200", label: "Prestations de services", class: 3, classLabel: CLASS_LABELS[3],
    type: "revenue",
    defaultTvaRate: 8.1, defaultTvaCode: "TVA-8.1-standard",
    description: "Facturation de services: conseils, travaux, mandats. Taux TVA standard 8.1%. Exigibilité selon méthode convenue ou encaissement (Art. 39-40 LTVA).",
  },
  {
    id: "3400", label: "Autres produits d'exploitation", class: 3, classLabel: CLASS_LABELS[3],
    type: "revenue",
    description: "Produits accessoires liés à l'exploitation principale: commissions, redevances, etc.",
  },
  {
    id: "3800", label: "Rabais et escomptes accordés", class: 3, classLabel: CLASS_LABELS[3],
    type: "revenue_adjustment",
    description: "Diminution du chiffre d'affaires brut. Comptabilisation en déduction du produit (OR Art. 959b). Réduction de base TVA si accordé avant exigibilité.",
  },

  // ── Classe 4 — Charges de matériel et marchandises ────────────────────
  {
    id: "4000", label: "Achats de marchandises destinées à la revente", class: 4, classLabel: CLASS_LABELS[4],
    type: "expense",
    defaultTvaRate: 8.1, defaultTvaCode: "TVA-8.1-deductible",
    description: "Coût des marchandises achetées pour revente. Déductible à 100% si activité TVA imposable. Impôt préalable déductible en 1170.",
  },
  {
    id: "4200", label: "Charges de sous-traitance / prestations de tiers", class: 4, classLabel: CLASS_LABELS[4],
    type: "expense",
    defaultTvaRate: 8.1,
    description: "Travaux confiés à des tiers dans le cadre de l'activité principale. TVA déductible si usage commercial.",
  },
  {
    id: "4400", label: "Variation de stocks", class: 4, classLabel: CLASS_LABELS[4],
    type: "expense_adjustment",
    description: "Ajustement stocks début/fin d'exercice. Créditeur si stocks augmentent (correction positive du résultat), débiteur si diminution.",
  },
  {
    id: "4900", label: "Frais d'achat / frais accessoires", class: 4, classLabel: CLASS_LABELS[4],
    type: "expense",
    description: "Transport sur achats, droits de douane, commissions d'achat. Inclus dans le coût de revient.",
  },

  // ── Classe 5 — Charges de personnel ───────────────────────────────────
  {
    id: "5000", label: "Salaires", class: 5, classLabel: CLASS_LABELS[5],
    type: "expense", nature: "personnel",
    defaultTvaRate: 0,
    description: "Salaires bruts versés aux employés. Hors TVA. Déclaration aux assurances sociales (AVS/LPP). Base de calcul des charges sociales en 5700.",
  },
  {
    id: "5700", label: "Charges sociales AVS/AI/APG/AC/AM", class: 5, classLabel: CLASS_LABELS[5],
    type: "expense", nature: "personnel",
    defaultTvaRate: 0,
    description: "Part employeur assurances sociales 2024: AVS 5.3% + AI 0.7% + APG 0.275% + AC 1.1% + AM variable. Total env. 8.5%. Déclaration annuelle AVS.",
  },
  {
    id: "5710", label: "Prestations LPP (2ème pilier)", class: 5, classLabel: CLASS_LABELS[5],
    type: "expense", nature: "personnel",
    defaultTvaRate: 0,
    description: "Cotisations employeur prévoyance professionnelle (LPP). Part employeur ≥ part employé. Coordination: salaire coordonné = salaire brut - déduction de coordination CHF 26'460 (2024).",
  },
  {
    id: "5720", label: "Assurance accident LAA", class: 5, classLabel: CLASS_LABELS[5],
    type: "expense", nature: "personnel",
    defaultTvaRate: 0,
    description: "Primes LAA (accidents professionnels: 100% employeur; non-professionnels: généralement employé). Obligatoire pour salariés > 8h/sem.",
  },
  {
    id: "5800", label: "Autres charges de personnel", class: 5, classLabel: CLASS_LABELS[5],
    type: "expense", nature: "personnel",
    description: "Frais repas, formations, cadeaux personnel, frais professionnels. Partiellement déductibles selon règles AFC (indemnités forfaitaires: accord préalable AFC recommandé).",
  },

  // ── Classe 6 — Autres charges d'exploitation ──────────────────────────
  {
    id: "6000", label: "Loyers", class: 6, classLabel: CLASS_LABELS[6],
    type: "expense",
    defaultTvaRate: 8.1, defaultTvaCode: "TVA-8.1-deductible-immeuble-pro",
    description: "Location de locaux commerciaux. TVA déductible uniquement si bailleur a opté pour l'imposition volontaire (Art. 22 LTVA). Loyer résidentiel exonéré.",
  },
  {
    id: "6100", label: "Entretien, réparation, remplacement", class: 6, classLabel: CLASS_LABELS[6],
    type: "expense",
    defaultTvaRate: 8.1,
    description: "Frais de maintenance courante. Distinction essentielle: entretien (charge immédiate) vs amélioration/agrandissement (à capitaliser en classe 1).",
  },
  {
    id: "6200", label: "Primes d'assurance choses", class: 6, classLabel: CLASS_LABELS[6],
    type: "expense",
    defaultTvaRate: 0,
    description: "Assurances incendie, RC, dommages aux biens. Exonérées de TVA (Art. 21 al. 2 ch. 18 LTVA). Pas d'impôt préalable à déduire.",
  },
  {
    id: "6300", label: "Énergie, eau, gaz, chauffage", class: 6, classLabel: CLASS_LABELS[6],
    type: "expense",
    defaultTvaRate: 8.1,
    description: "Charges d'énergie liées à l'exploitation. TVA déductible à 100% si usage commercial exclusif, prorata si usage mixte (Art. 30 LTVA).",
  },
  {
    id: "6400", label: "Frais de télécommunication", class: 6, classLabel: CLASS_LABELS[6],
    type: "expense",
    defaultTvaRate: 8.1,
    description: "Téléphonie, internet, cloud. TVA déductible. Usage privé d'un téléphone d'entreprise: prestation appréciable en argent à déclarer (estimation 20% usage privé usuel).",
  },
  {
    id: "6500", label: "Frais administratifs (fournitures, abonnements)", class: 6, classLabel: CLASS_LABELS[6],
    type: "expense",
    defaultTvaRate: 8.1,
    description: "Fournitures de bureau, abonnements professionnels, frais postaux. TVA déductible.",
  },
  {
    id: "6510", label: "Honoraires fiduciaires / conseillers", class: 6, classLabel: CLASS_LABELS[6],
    type: "expense",
    defaultTvaRate: 8.1,
    description: "Frais comptabilité, révision, conseil juridique et fiscal. Déductibles si relatifs à l'activité lucrative (Art. 59 LIFD). TVA déductible.",
  },
  {
    id: "6600", label: "Publicité et relations publiques", class: 6, classLabel: CLASS_LABELS[6],
    type: "expense",
    defaultTvaRate: 8.1,
    description: "Frais publicitaires, marketing, sponsoring. Déductibles si lien direct avec l'activité commerciale. TVA déductible.",
  },
  {
    id: "6640", label: "Frais de repas et représentation", class: 6, classLabel: CLASS_LABELS[6],
    type: "expense",
    defaultTvaRate: 8.1,
    description: "Repas d'affaires, frais de représentation. Déductibles à 50% fiscalement (Art. 34 let. a LIFD: frais non justifiés par l'usage commercial). Impôt préalable TVA déductible à 100% si repas strictement professionnel.",
  },
  {
    id: "6700", label: "Amortissements", class: 6, classLabel: CLASS_LABELS[6],
    type: "expense",
    defaultTvaRate: 0,
    description: "Amortissements sur immobilisations selon Notice A/1995 AFC. Méthode dégressive sur valeur résiduelle (taux maxima: machines 30%, véhicules 40%, informatique 40%, immeubles 7%). Art. 62 LIFD: amortissements commercialement justifiés.",
  },
  {
    id: "6800", label: "Charges financières (intérêts et frais bancaires)", class: 6, classLabel: CLASS_LABELS[6],
    type: "expense",
    defaultTvaRate: 0,
    description: "Intérêts passifs, frais de tenue de compte, commissions bancaires. Exonérés de TVA (Art. 21 al. 2 ch. 19 LTVA). Intérêts sur capital propre dissimulé non déductibles (Circ. 6a AFC).",
  },

  // ── Classe 7 — Résultat accessoire ────────────────────────────────────
  {
    id: "7000", label: "Produits accessoires", class: 7, classLabel: CLASS_LABELS[7],
    type: "revenue",
    description: "Produits hors activité principale: sous-location, services divers. Imposable TVA selon nature.",
  },
  {
    id: "7500", label: "Produits financiers (intérêts bancaires perçus)", class: 7, classLabel: CLASS_LABELS[7],
    type: "revenue",
    defaultTvaRate: 0,
    description: "Intérêts créanciers, dividendes sur participations. Exonérés TVA (Art. 21 ch. 19). Imposables IFD au taux ordinaire. Réduction pour participations ≥ 10% ou CHF 1M (Art. 69 LIFD).",
  },
  {
    id: "7900", label: "Produits immobiliers (loyers reçus)", class: 7, classLabel: CLASS_LABELS[7],
    type: "revenue",
    defaultTvaRate: 0,
    description: "Loyers encaissés sur immeubles appartenant à la société. Exonérés TVA sauf option (Art. 22 LTVA). Pleinement imposables IFD/ICC.",
  },

  // ── Classe 8 — Résultat extraordinaire ───────────────────────────────
  {
    id: "8000", label: "Charges extraordinaires / uniques", class: 8, classLabel: CLASS_LABELS[8],
    type: "expense",
    description: "Charges exceptionnelles non récurrentes: sinistres, pertes sur cessions d'actifs, restructurations. Séparation du résultat ordinaire requise par Swiss GAAP.",
  },
  {
    id: "8100", label: "Produits extraordinaires / uniques", class: 8, classLabel: CLASS_LABELS[8],
    type: "revenue",
    description: "Plus-values sur cessions d'actifs immobilisés, indemnités d'assurance, produits non récurrents. Pleinement imposables IFD/ICC (Art. 58 al. 1 let. c LIFD).",
  },

  // ── Classe 9 — Clôture ─────────────────────────────────────────────────
  {
    id: "9000", label: "Compte de résultat", class: 9, classLabel: CLASS_LABELS[9],
    type: "closing",
    description: "Compte de clôture du résultat (compte P&L). Utilisé en écritures de clôture annuelle uniquement.",
  },
  {
    id: "9100", label: "Bilan", class: 9, classLabel: CLASS_LABELS[9],
    type: "closing",
    description: "Compte de bilan pour les écritures de clôture de fin d'exercice. Solde = report en 2970.",
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildText(acc: KaeferAccount): string {
  const parts: string[] = [
    `Plan comptable PME suisse (Käfer) — compte ${acc.id}`,
    `Libellé: ${acc.label}`,
    `Classe: ${acc.class} (${acc.classLabel})`,
    `Type: ${acc.type}`,
  ];
  if (acc.nature) parts.push(`Nature: ${acc.nature}`);
  if (acc.description) parts.push(`Description: ${acc.description}`);
  if (acc.defaultTvaRate !== undefined) parts.push(`Taux TVA par défaut: ${acc.defaultTvaRate}%`);
  if (acc.defaultTvaCode) parts.push(`Code TVA: ${acc.defaultTvaCode}`);
  if (acc.depreciationRateAfc !== undefined) parts.push(`Taux amortissement AFC: ${acc.depreciationRateAfc}%`);
  if (acc.source) parts.push(`Source: ${acc.source}`);
  return parts.join(" | ");
}

function buildPayload(acc: KaeferAccount): QdrantPayload {
  const payload: QdrantPayload = {
    text: buildText(acc),
    law: "Plan-Kafer",
    law_label: "Plan comptable PME suisse (Käfer)",
    article: `compte ${acc.id}`,
    article_num: acc.id,
    heading: acc.label,
    rs: null,
    topic: "plan_comptable_kafer",
    category: acc.type,
    account_class: acc.class,
    date_version: "2024-01-01",
    source: "kafer",
    jurisdiction: "federal",
  };
  if (acc.nature !== undefined) payload.account_nature = acc.nature;
  if (acc.defaultTvaRate !== undefined) payload.default_tva_rate = acc.defaultTvaRate;
  if (acc.defaultTvaCode !== undefined) payload.default_tva_code = acc.defaultTvaCode;
  if (acc.depreciationRateAfc !== undefined) payload.depreciation_rate_afc = acc.depreciationRateAfc;
  return payload;
}

// ---------------------------------------------------------------------------
// Qdrant REST helpers (pas de SDK — même pattern que QdrantClient.ts existant)
// ---------------------------------------------------------------------------

async function deleteExistingKafer(): Promise<void> {
  try {
    await axios.post(`${QDRANT_URL}/collections/${COLLECTION}/points/delete`, {
      filter: {
        must: [{ key: "law", match: { value: "Plan-Kafer" } }],
      },
    });
    console.log("[kafer] Points Plan-Kafer existants supprimés");
  } catch (err) {
    console.warn("[kafer] Delete skipped:", (err as Error).message);
  }
}

async function upsertPoints(payloads: QdrantPayload[], vectors: number[][]): Promise<void> {
  const points = payloads.map((payload, i) => ({
    id: randomUUID(),
    vector: vectors[i],
    payload,
  }));

  await axios.put(`${QDRANT_URL}/collections/${COLLECTION}/points`, {
    points,
  });
}

async function countPoints(): Promise<number> {
  const { data } = await axios.get<{ result: { points_count: number } }>(
    `${QDRANT_URL}/collections/${COLLECTION}`,
  );
  return data.result.points_count;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(`[kafer] QDRANT : ${QDRANT_URL}`);
  console.log(`[kafer] EMBEDDER: ${EMBEDDER_URL}`);
  console.log(`[kafer] COLLECTION: ${COLLECTION}`);
  console.log(`[kafer] Comptes à ingérer: ${ACCOUNTS.length}`);

  // 1. Build payloads
  const payloads = ACCOUNTS.map(buildPayload);
  const texts = payloads.map((p) => p.text);

  // 2. Embed
  console.log("[kafer] Embedding via BGE-M3...");
  const t0 = Date.now();
  const { data: embedResponse } = await axios.post<{
    data: Array<{ index: number; embedding: number[] }>;
  }>(`${EMBEDDER_URL}/v1/embeddings`, { input: texts });

  const vectors = embedResponse.data
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((item) => item.embedding);

  console.log(`[kafer] ${vectors.length} vecteurs produits en ${Date.now() - t0}ms (dim=${vectors[0]?.length ?? "?"})`);

  // 3. Delete existing
  const before = await countPoints();
  console.log(`[kafer] Points avant: ${before}`);
  await deleteExistingKafer();

  // 4. Upsert
  await upsertPoints(payloads, vectors);
  const after = await countPoints();
  console.log(`[kafer] Points après: ${after} (+${after - before})`);

  // 5. Quick smoke test
  console.log("\n[kafer] === Smoke test RAG ===");
  const testQueries = [
    "compte caisse plan comptable",
    "amortissement véhicule taux AFC",
    "TVA impôt préalable déductible",
    "salaire AVS charges sociales",
    "compte loyer exploitation",
  ];

  for (const q of testQueries) {
    const { data: qEmbed } = await axios.post<{
      data: Array<{ index: number; embedding: number[] }>;
    }>(`${EMBEDDER_URL}/v1/embeddings`, { input: [q] });
    const qVec = qEmbed.data[0]?.embedding ?? [];

    const { data: searchRes } = await axios.post<{ result: Array<{ id: string; score: number; payload: QdrantPayload }> }>(
      `${QDRANT_URL}/collections/${COLLECTION}/points/search`,
      { vector: qVec, limit: 3, with_payload: true },
    );

    console.log(`\n  Q: "${q}"`);
    for (const hit of searchRes.result) {
      const mark = hit.payload.law === "Plan-Kafer" ? "[KAFER]" : "       ";
      console.log(`    ${mark} [${hit.score.toFixed(3)}] ${hit.payload.law} ${hit.payload.article} — ${hit.payload.heading}`);
    }
  }

  console.log("\n[kafer] DONE ✓");
}

main().catch((err: unknown) => {
  console.error("[kafer] FATAL:", err);
  process.exit(1);
});
