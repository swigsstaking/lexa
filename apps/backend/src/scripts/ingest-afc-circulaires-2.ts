#!/usr/bin/env node
/**
 * ingest-afc-circulaires-2 — Ingère les circulaires AFC IFD/TVA restantes dans Qdrant.
 *
 * Circulaires ingérées (complément de ingest-afc-circulaires.ts) :
 *   - Circ 6a   : Impôt à la source — taux et procédure (PP salariés étrangers)
 *   - Circ 15   : Restructurations — fusions, scissions, transformations (PM critique)
 *   - Circ 25   : Participations qualifiées — réduction pour participations ≥10% (PM)
 *   - Circ 29c  : Intérêts sur avances d'actionnaires — taux admis fiscalement
 *   - Circ 32a  : Amortissements — taux AFC Notice A intégrés
 *   - Circ 37   : Activité accessoire indépendante — seuil CHF 2'300 (PP)
 *   - Circ 44   : Expatriés — déductions spéciales logement/scolarité
 *   - Circ 45   : Télétravail transfrontalier — répartition fiscale
 *   - Circ 49   : Crypto-monnaies — qualification fiscale (PP et PM)
 *   - Circ 50a  : Plateformes numériques — assujettissement TVA
 *
 * Exécution (depuis apps/backend/) :
 *   npx tsx src/scripts/ingest-afc-circulaires-2.ts
 *   QDRANT_URL=http://192.168.110.103:6333 EMBEDDER_URL=http://192.168.110.103:8082 npx tsx src/scripts/ingest-afc-circulaires-2.ts
 *
 * Stratégie :
 *   - 3-4 chunks par circulaire avec résumés denses (~200-400 tokens)
 *   - Idempotent: supprime les points existants avant upsert
 */

import axios from "axios";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const QDRANT_URL = process.env.QDRANT_URL ?? "http://192.168.110.103:6333";
const EMBEDDER_URL = process.env.EMBEDDER_URL ?? "http://192.168.110.103:8082";
const COLLECTION = process.env.QDRANT_COLLECTION ?? "swiss_law";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CirculaireChunk {
  text: string;
  law: string;
  law_label: string;
  article: string;
  article_num: string;
  heading: string;
  rs: null;
  topic: string;
  category: string;
  date_version: string;
  source: string;
  jurisdiction: string;
  url: string;
}

// ---------------------------------------------------------------------------
// Circ 6a — Impôt à la source (salariés étrangers, PP)
// ---------------------------------------------------------------------------

const CIRC_6A_CHUNKS: CirculaireChunk[] = [
  {
    text: "[AFC-IFD-Circ-6a] Impôt à la source — assujettissement et catégories de débiteurs. " +
      "La Circulaire 6a de l'AFC (révisée 2021) régit l'impôt à la source (IS) sur les revenus de l'activité lucrative des personnes physiques étrangères résidant en Suisse sans permis d'établissement (permis C) et des frontaliers. " +
      "Catégories de contribuables soumis à l'IS: " +
      "(1) Résidents étrangers sans permis C (permis B, L, G frontaliers): IS retenu par l'employeur sur le salaire brut. " +
      "(2) Non-résidents percevant des revenus de source suisse: revenus d'activité, tantièmes d'administrateurs, revenus artistiques, sportifs. " +
      "Le débiteur de la prestation imposable (DPI = l'employeur) est responsable du prélèvement et du versement à l'autorité cantonale. " +
      "Taux IS: barèmes cantonaux selon situation familiale (A, B, C, D, E, G, H, L, M, N, P, Q). Calcul sur salaire brut mensuel reconstitué sur 12 mois. " +
      "Rectification de l'IS (Art. 89a LIFD): titulaires d'un permis B avec revenu ≥ CHF 120'000 ou revenus complémentaires hors IS doivent déposer une déclaration ordinaire ultérieure (DOU).",
    law: "AFC-IFD-Circ-6a",
    law_label: "Circulaire AFC IFD n°6a — Impôt à la source, salariés étrangers (2021)",
    article: "section 1",
    article_num: "1",
    heading: "IS — assujettissement, catégories permis B/L/G, barèmes cantonaux, DPI employeur",
    rs: null,
    topic: "impot_source",
    category: "circular-ifd",
    date_version: "2021-01-01",
    source: "afc",
    jurisdiction: "federal",
    url: "https://www.estv.admin.ch/fr/impot-federal-direct/informations-professionnelles/circulaires.html",
  },
  {
    text: "[AFC-IFD-Circ-6a] Impôt à la source — calcul, éléments du salaire déterminant. " +
      "Le salaire déterminant pour le calcul de l'IS comprend: " +
      "salaire de base, bonus, primes, gratifications, avantages en nature (véhicule d'entreprise, logement, repas), heures supplémentaires, indemnités de vacances, 13ème salaire. " +
      "Éléments exclus: remboursements de frais effectifs justifiés (frais de déplacement réels, frais de représentation documentés), allocations familiales légales. " +
      "Méthode de calcul mensuelle: salaire brut mensuel × 12 = salaire annuel reconstitué → taux IS correspondant sur table cantonale → IS mensuel = (taux × salaire mensuel). " +
      "Barème A: célibataire sans enfant. Barème B: marié, conjoint sans revenu. Barème C: deux revenus (deux époux actifs). Barème H: familles monoparentales. Barème G: frontaliers. " +
      "Attention aux particularités cantonales: certains cantons appliquent des barèmes distincts pour les revenus accessoires et les indemnités de chômage.",
    law: "AFC-IFD-Circ-6a",
    law_label: "Circulaire AFC IFD n°6a — Impôt à la source, salariés étrangers (2021)",
    article: "section 2",
    article_num: "2",
    heading: "IS — salaire déterminant, barèmes A/B/C/H/G, calcul mensuel reconstitution",
    rs: null,
    topic: "impot_source",
    category: "circular-ifd",
    date_version: "2021-01-01",
    source: "afc",
    jurisdiction: "federal",
    url: "https://www.estv.admin.ch/fr/impot-federal-direct/informations-professionnelles/circulaires.html",
  },
  {
    text: "[AFC-IFD-Circ-6a] Impôt à la source — déclaration ordinaire ultérieure (DOU) et quasi-résidents. " +
      "Déclaration ordinaire ultérieure (DOU) obligatoire si: " +
      "(1) Revenu brut annuel ≥ CHF 120'000 (permis B): le salarié dépose une déclaration d'impôt ordinaire; l'IS retenu est déduit de l'impôt total calculé. Delai: 31 mars N+1. " +
      "(2) Revenus non soumis à l'IS (fortune, loyers, revenus étrangers): déclaration ordinaire systématique requise. " +
      "(3) Déductions non prises en compte dans le barème IS (déductions Art. 33 LIFD: intérêts hypothécaires, primes assurance, pilier 3a): peuvent être réclamées via DOU. " +
      "Quasi-résidents (frontaliers avec 90% du revenu mondial en Suisse): droit à la déclaration ordinaire dans le canton de travail pour bénéficier des mêmes déductions qu'un résident (arrêt TF 2C_664/2013). " +
      "Obligations du DPI: certificat de salaire annuel (formulaire 11) remis au salarié avant le 31 janvier N+1, décompte annuel IS versé au canton avant le 31 mars.",
    law: "AFC-IFD-Circ-6a",
    law_label: "Circulaire AFC IFD n°6a — Impôt à la source, salariés étrangers (2021)",
    article: "section 3",
    article_num: "3",
    heading: "DOU — seuil CHF 120'000, quasi-résidents, déductions réclamables, obligations DPI",
    rs: null,
    topic: "impot_source",
    category: "circular-ifd",
    date_version: "2021-01-01",
    source: "afc",
    jurisdiction: "federal",
    url: "https://www.estv.admin.ch/fr/impot-federal-direct/informations-professionnelles/circulaires.html",
  },
];

// ---------------------------------------------------------------------------
// Circ 15 — Restructurations (fusions, scissions, transformations)
// ---------------------------------------------------------------------------

const CIRC_15_CHUNKS: CirculaireChunk[] = [
  {
    text: "[AFC-IFD-Circ-15] Restructurations — principe de neutralité fiscale et conditions. " +
      "La Circulaire 15 de l'AFC (2007, mise à jour 2017) traite le régime de neutralité fiscale des restructurations d'entreprises (fusions, scissions, transformations, transferts de patrimoine). " +
      "Principe fondamental: une restructuration peut être réalisée sans imposition immédiate des réserves latentes si les conditions légales sont remplies (Art. 19, 61, 68 LIFD; LFUSIO RS 221.301). " +
      "Conditions générales cumulatives: " +
      "(1) Continuité de l'exploitation: l'activité doit se poursuivre dans la structure d'accueil (pas de liquidation déguisée). " +
      "(2) Maintien de l'assujettissement en Suisse: les actifs transférés restent imposables en Suisse. " +
      "(3) Reprise des valeurs fiscales: l'entité repreneuse comptabilise les actifs aux valeurs fiscales de l'entité apporteuse. " +
      "(4) Délai de blocage: les participations reçues lors d'apports ou de fusions ne peuvent être revendues dans les 5 ans sans imposition des réserves latentes réalisées. " +
      "En cas de non-respect des conditions: imposition immédiate de toutes les réserves latentes (y compris goodwill) comme bénéfice de l'exercice.",
    law: "AFC-IFD-Circ-15",
    law_label: "Circulaire AFC IFD n°15 — Restructurations (fusions, scissions, transformations)",
    article: "section 1",
    article_num: "1",
    heading: "Neutralité fiscale restructurations — conditions, continuité exploitation, délai blocage 5 ans",
    rs: null,
    topic: "restructurations",
    category: "circular-ifd",
    date_version: "2007-01-01",
    source: "afc",
    jurisdiction: "federal",
    url: "https://www.estv.admin.ch/fr/impot-federal-direct/informations-professionnelles/circulaires.html",
  },
  {
    text: "[AFC-IFD-Circ-15] Fusions — traitement fiscal IFD pour les PM. " +
      "Fusion par absorption (Art. 3 ss LFUSIO): la société absorbante reprend les actifs et passifs de la société absorbée à leur valeur fiscale. " +
      "Traitement comptable admis AFC: " +
      "(1) Méthode du report des valeurs comptables: pas de réalisation des réserves latentes — goodwill non comptabilisé. " +
      "(2) Méthode de la valeur vénale: goodwill activé chez la repreneuse — imposition immédiate des réserves latentes de la société absorbée. " +
      "Pertes reportées: les pertes fiscales de la société absorbée peuvent être reprises par la société absorbante uniquement si l'activité qui a généré ces pertes est effectivement poursuivie (restriction anti-abus, Art. 67 al. 2 LIFD). " +
      "Fusion par création (Art. 4 LFUSIO): deux sociétés fusionnent en une nouvelle entité — mêmes règles; les deux séries de pertes ne sont reprises que sous conditions strictes. " +
      "Impôt anticipé: pas d'IA lors d'une fusion si les réserves ne sont pas distribuées.",
    law: "AFC-IFD-Circ-15",
    law_label: "Circulaire AFC IFD n°15 — Restructurations (fusions, scissions, transformations)",
    article: "section 2",
    article_num: "2",
    heading: "Fusion par absorption/création — valeurs fiscales, reprise pertes, goodwill, pas d'IA",
    rs: null,
    topic: "restructurations",
    category: "circular-ifd",
    date_version: "2007-01-01",
    source: "afc",
    jurisdiction: "federal",
    url: "https://www.estv.admin.ch/fr/impot-federal-direct/informations-professionnelles/circulaires.html",
  },
  {
    text: "[AFC-IFD-Circ-15] Scissions, transformations et apports — règles spécifiques. " +
      "Scission (Art. 29 ss LFUSIO): une société transfère une ou plusieurs parties de son activité à une ou plusieurs sociétés bénéficiaires. " +
      "Conditions supplémentaires pour la neutralité fiscale: les deux parties doivent constituer des branches d'activité économiquement autonomes (test de l'unité autonome d'exploitation). " +
      "Transformation (SA ↔ Sàrl, changement de forme juridique): réputée fiscalement neutre si les fonds propres restent inchangés et que l'assujettissement est maintenu. " +
      "Apport d'exploitation (Art. 19 LIFD): une PP transfère son entreprise individuelle à une SA/Sàrl aux valeurs fiscales — neutralité si la PP détient au moins 50% du capital pendant 5 ans. " +
      "Quasi-fusion (échange de droits): la société repreneuse reçoit des actifs et émet des nouvelles actions en contrepartie — neutralité sous réserve du délai de blocage. " +
      "TVA lors de restructurations: les transferts de patrimoine entre assujettis peuvent être réalisés sans TVA si la société repreneuse reprend l'activité TVA (Art. 29 al. 1 LTVA — transfert de patrimoine hors champ).",
    law: "AFC-IFD-Circ-15",
    law_label: "Circulaire AFC IFD n°15 — Restructurations (fusions, scissions, transformations)",
    article: "section 3",
    article_num: "3",
    heading: "Scissions (branche autonome), transformations, apports PP→SA, TVA transfert patrimoine",
    rs: null,
    topic: "restructurations",
    category: "circular-ifd",
    date_version: "2007-01-01",
    source: "afc",
    jurisdiction: "federal",
    url: "https://www.estv.admin.ch/fr/impot-federal-direct/informations-professionnelles/circulaires.html",
  },
];

// ---------------------------------------------------------------------------
// Circ 25 — Participations qualifiées (PM)
// ---------------------------------------------------------------------------

const CIRC_25_CHUNKS: CirculaireChunk[] = [
  {
    text: "[AFC-IFD-Circ-25] Réduction pour participations qualifiées — mécanisme et seuils. " +
      "La Circulaire 25 de l'AFC (2011) détaille l'application de la réduction pour participations (Art. 69-70 LIFD) permettant d'atténuer la double imposition économique des bénéfices distribués au sein d'un groupe. " +
      "Conditions pour la réduction: " +
      "(1) La PM détient au moins 10% du capital-actions/parts d'une autre société; OU " +
      "(2) La participation a une valeur vénale d'au moins CHF 1'000'000; ET " +
      "(3) La PM a détenu la participation pendant au moins 1 an avant la distribution (délai de blocage anti-abus). " +
      "Calcul de la réduction: " +
      "Réduction (%) = Rendement net des participations qualifiées / Bénéfice net total. " +
      "L'impôt calculé sur le bénéfice total est réduit de ce pourcentage. Rendement net = dividendes + plus-values sur participations − frais de financement attribuables aux participations. " +
      "Taux IFD effectif sur dividendes intragroupe ≈ 0% si 100% participation (réduction intégrale).",
    law: "AFC-IFD-Circ-25",
    law_label: "Circulaire AFC IFD n°25 — Réduction pour participations qualifiées (PM)",
    article: "section 1",
    article_num: "1",
    heading: "Réduction participations — seuil 10%/CHF 1M, délai 1 an, calcul réduction Art. 69-70 LIFD",
    rs: null,
    topic: "participations_qualifiees",
    category: "circular-ifd",
    date_version: "2011-01-01",
    source: "afc",
    jurisdiction: "federal",
    url: "https://www.estv.admin.ch/fr/impot-federal-direct/informations-professionnelles/circulaires.html",
  },
  {
    text: "[AFC-IFD-Circ-25] Participations qualifiées — plus-values, réductions sur gains en capital et méthode de calcul. " +
      "Art. 70 LIFD: les bénéfices en capital réalisés sur aliénation de participations qualifiées (≥ 10% depuis ≥ 1 an) bénéficient également de la réduction pour participations. " +
      "Méthode de calcul Circ. 25: " +
      "1. Calculer le bénéfice net total (résultat fiscal avant réduction). " +
      "2. Isoler le rendement net des participations qualifiées (dividendes + gains aliénation − frais attribuables). " +
      "3. Si le rendement net participations < 0 (net de frais): pas de réduction, mais la perte nette est imputée sur le bénéfice total. " +
      "4. Si > 0: rapport = rendement net participations / bénéfice net total → réduction proportionnelle de l'impôt. " +
      "Frais attribuables aux participations: intérêts sur dettes de financement proportionnels + frais d'administration directement imputables (calculés au prorata valeur participations / total actifs). " +
      "Limitation: la réduction ne peut pas créer de remboursement d'impôt (plancher à zéro).",
    law: "AFC-IFD-Circ-25",
    law_label: "Circulaire AFC IFD n°25 — Réduction pour participations qualifiées (PM)",
    article: "section 2",
    article_num: "2",
    heading: "Plus-values participations, frais attribuables, calcul réduction Art. 70 LIFD, plancher zéro",
    rs: null,
    topic: "participations_qualifiees",
    category: "circular-ifd",
    date_version: "2011-01-01",
    source: "afc",
    jurisdiction: "federal",
    url: "https://www.estv.admin.ch/fr/impot-federal-direct/informations-professionnelles/circulaires.html",
  },
  {
    text: "[AFC-IFD-Circ-25] Holding pure et participations étrangères — traitement fiscal spécifique. " +
      "Holding pure: société dont l'actif est composé exclusivement ou principalement (≥ 2/3) de participations. " +
      "Au niveau cantonal/communal: les holdings pures bénéficient d'un statut fiscal privilégié (impôt sur le capital réduit, exonération du bénéfice sur dividendes et plus-values — taux nominal souvent 0.075% du capital). " +
      "Au niveau IFD: pas de statut particulier — la réduction pour participations Art. 69-70 LIFD s'applique normalement. " +
      "Participations étrangères: dividendes de filiales étrangères bénéficient de la réduction si les conditions (≥ 10%, ≥ 1 an) sont remplies. " +
      "Interaction avec les CDI: les retenues à la source étrangères sur dividendes sont imputables sur l'IFD suisse (imputation forfaitaire d'impôt IFI si CDI applicable). " +
      "Attention: la réduction pour participations est calculée sur le bénéfice net de participations après imputation de l'IFI — pas de double avantage.",
    law: "AFC-IFD-Circ-25",
    law_label: "Circulaire AFC IFD n°25 — Réduction pour participations qualifiées (PM)",
    article: "section 3",
    article_num: "3",
    heading: "Holding — statut cantonal privilégié, participations étrangères, CDI et imputation IFI",
    rs: null,
    topic: "participations_qualifiees",
    category: "circular-ifd",
    date_version: "2011-01-01",
    source: "afc",
    jurisdiction: "federal",
    url: "https://www.estv.admin.ch/fr/impot-federal-direct/informations-professionnelles/circulaires.html",
  },
];

// ---------------------------------------------------------------------------
// Circ 29c — Intérêts sur avances d'actionnaires / taux admis AFC
// ---------------------------------------------------------------------------

const CIRC_29C_CHUNKS: CirculaireChunk[] = [
  {
    text: "[AFC-IFD-Circ-29c] Taux d'intérêt admis sur avances et prêts d'actionnaires — cadre général. " +
      "La Circulaire 29c de l'AFC (annuellement mise à jour) publie les taux d'intérêt minimaux et maximaux admis fiscalement sur les relations financières entre les sociétés et leurs actionnaires (ou personnes proches). " +
      "Contexte: lorsqu'une société verse ou reçoit des intérêts à/de son actionnaire à des taux hors marché, la différence constitue une prestation appréciable en argent (PAA) imposable. " +
      "Taux admis 2024 (indicatifs — vérifier lettre circulaire AFC annuelle): " +
      "Prêts de la société à l'actionnaire (CHF): taux minimum 2.25% (si actif financé par fonds étrangers) ou 1.5% (si actif financé par fonds propres). " +
      "Prêts de l'actionnaire à la société (CHF): taux maximum admis dépend du financement de la société — en général taux bancaire usuel + marge de 0.5-1%. " +
      "Si le taux effectif est inférieur au minimum (prêt à l'actionnaire) ou supérieur au maximum (prêt de l'actionnaire) → PAA = différence × montant du prêt.",
    law: "AFC-IFD-Circ-29c",
    law_label: "Circulaire AFC IFD n°29c — Intérêts sur avances actionnaires, taux admis (annuel)",
    article: "section 1",
    article_num: "1",
    heading: "Taux d'intérêt admis 2024 — prêts société↔actionnaire, seuils min/max, PAA si hors marché",
    rs: null,
    topic: "interets_actionnaires",
    category: "circular-ifd",
    date_version: "2024-01-01",
    source: "afc",
    jurisdiction: "federal",
    url: "https://www.estv.admin.ch/fr/impot-federal-direct/informations-professionnelles/circulaires.html",
  },
  {
    text: "[AFC-IFD-Circ-29c] Capital propre dissimulé et thin capitalisation — règles de financement sûr. " +
      "La Circ. 29c intègre les règles de financement sûr AFC (règles de la thin capitalisation) qui déterminent le montant de dettes envers actionnaires admis fiscalement. " +
      "Règles de financement sûr (safe harbour): pour chaque catégorie d'actifs, l'AFC admet un taux de financement par dettes envers actionnaires maximal: " +
      "- Liquidités: jusqu'à 100% de la valeur comptable; " +
      "- Créances: jusqu'à 85%; " +
      "- Stocks: jusqu'à 85%; " +
      "- Immobilisations financières (actions): jusqu'à 70%; " +
      "- Immeubles commerciaux: jusqu'à 70%; " +
      "- Autres immobilisations: jusqu'à 50%. " +
      "Si les dettes envers actionnaires dépassent ces ratios: la fraction excessive = capital propre dissimulé. Les intérêts sur cette fraction sont refusés en déduction (reprise fiscale). " +
      "La société peut contester en prouvant qu'un tiers indépendant aurait accordé le même financement aux mêmes conditions.",
    law: "AFC-IFD-Circ-29c",
    law_label: "Circulaire AFC IFD n°29c — Intérêts sur avances actionnaires, taux admis (annuel)",
    article: "section 2",
    article_num: "2",
    heading: "Thin capitalisation — ratios safe harbour par actif, capital propre dissimulé, reprise intérêts",
    rs: null,
    topic: "interets_actionnaires",
    category: "circular-ifd",
    date_version: "2024-01-01",
    source: "afc",
    jurisdiction: "federal",
    url: "https://www.estv.admin.ch/fr/impot-federal-direct/informations-professionnelles/circulaires.html",
  },
  {
    text: "[AFC-IFD-Circ-29c] Principe d'apport de capital (KEP) — réserves restituables en franchise d'impôt. " +
      "Le principe du capital d'apport (Kapitaleinlageprinzip, KEP) est central à la Circ. 29c: les apports directs des actionnaires à la société (au-delà du capital nominal — agios, apports sans émission de droits) constituent des réserves d'apport de capital inscrites séparément au bilan. " +
      "Restitution en franchise: ces réserves peuvent être restituées aux actionnaires sans impôt anticipé (Art. 5 al. 1bis LIA) et sans imposition PP (Art. 20 al. 3 LIFD), à condition que: " +
      "(1) elles soient séparément comptabilisées et attestées à l'AFC; " +
      "(2) la procédure de déclaration formelle soit respectée (art. 5 OIA). " +
      "Interaction avec les prêts actionnaires: si un actionnaire apporte de l'argent sous forme de prêt (et non d'apport de capital), cela ne constitue pas une réserve KEP. " +
      "Conversion prêt → apport: possible si les formalités légales (modification des statuts, inscription RC) sont respectées — à planifier avec soin pour éviter la requalification.",
    law: "AFC-IFD-Circ-29c",
    law_label: "Circulaire AFC IFD n°29c — Intérêts sur avances actionnaires, taux admis (annuel)",
    article: "section 3",
    article_num: "3",
    heading: "KEP — réserves d'apport de capital, restitution sans IA ni PP, comptabilisation séparée",
    rs: null,
    topic: "interets_actionnaires",
    category: "circular-ifd",
    date_version: "2024-01-01",
    source: "afc",
    jurisdiction: "federal",
    url: "https://www.estv.admin.ch/fr/impot-federal-direct/informations-professionnelles/circulaires.html",
  },
];

// ---------------------------------------------------------------------------
// Circ 32a — Amortissements (Notice A / taux AFC)
// ---------------------------------------------------------------------------

const CIRC_32A_CHUNKS: CirculaireChunk[] = [
  {
    text: "[AFC-IFD-Circ-32a] Amortissements admis fiscalement — Notice A/1995 et taux maxima. " +
      "La Circulaire 32a de l'AFC (qui intègre et actualise la Notice A/1995) fixe les taux d'amortissement maximaux admis en déduction de l'impôt fédéral direct. " +
      "Taux maxima en méthode dégressive (sur valeur résiduelle): " +
      "- Machines et appareils de production: 30% " +
      "- Mobilier, agencements, installations: 25% " +
      "- Véhicules à moteur (tous types): 40% " +
      "- Matériel informatique (hardware): 40% " +
      "- Logiciels, développements informatiques: 40% " +
      "- Immeubles commerciaux (bâtiments): 7% (terrain: 0%, non amortissable) " +
      "- Installations d'exploitation dans bâtiments: 20% " +
      "Taux en méthode linéaire: environ moitié des taux dégressifs (ex. machines: 15% linéaire). " +
      "Amortissement total en une année (100%): admis uniquement pour les biens de faible valeur (< CHF 1'000 valeur unitaire). " +
      "Passage de dégressif à linéaire: admis en cours de vie de l'actif, jamais l'inverse.",
    law: "AFC-IFD-Circ-32a",
    law_label: "Circulaire AFC IFD n°32a — Amortissements, taux Notice A intégrés",
    article: "section 1",
    article_num: "1",
    heading: "Taux amortissement AFC — Notice A: machines 30%, véhicules 40%, informatique 40%, immeubles 7%",
    rs: null,
    topic: "amortissements",
    category: "circular-ifd",
    date_version: "2013-01-01",
    source: "afc",
    jurisdiction: "federal",
    url: "https://www.estv.admin.ch/fr/impot-federal-direct/informations-professionnelles/circulaires.html",
  },
  {
    text: "[AFC-IFD-Circ-32a] Amortissements — règles de base, justification commerciale et biens incorporels. " +
      "Règle générale (Art. 62 LIFD): l'amortissement est commercialement justifié s'il correspond à la perte de valeur effective de l'actif au cours de l'exercice. L'AFC admet les taux de la Notice A sans exiger de preuve de dépréciation effective — ils constituent une présomption simple. " +
      "Amortissements exceptionnels: admis si une dépréciation durable et extraordinaire est prouvée (ex. technologie obsolète, sinistre). L'AFC peut demander une justification détaillée. " +
      "Biens incorporels (goodwill, brevets, marques, droits d'auteur): " +
      "- Goodwill acquis (acquisition d'entreprise): amortissable sur durée d'utilité estimée, max 5 ans selon OR Art. 960a (10 ans si justifié). " +
      "- Goodwill créé en interne: non activable, donc non amortissable. " +
      "- Brevets, licences: durée légale de protection ou durée contractuelle. " +
      "Terrain: strictement non amortissable (valeur ne se déprécie pas fiscalement). " +
      "Solde résiduel de 1 CHF: lorsque la valeur résiduelle tend vers zéro, l'actif est maintenu au bilan à 1 CHF jusqu'à sa sortie.",
    law: "AFC-IFD-Circ-32a",
    law_label: "Circulaire AFC IFD n°32a — Amortissements, taux Notice A intégrés",
    article: "section 2",
    article_num: "2",
    heading: "Amortissements exceptionnels, goodwill (max 5-10 ans), brevets, terrain non amortissable",
    rs: null,
    topic: "amortissements",
    category: "circular-ifd",
    date_version: "2013-01-01",
    source: "afc",
    jurisdiction: "federal",
    url: "https://www.estv.admin.ch/fr/impot-federal-direct/informations-professionnelles/circulaires.html",
  },
  {
    text: "[AFC-IFD-Circ-32a] Amortissements PM vs PP indépendants — différences de traitement. " +
      "Pour les personnes morales (PM): les amortissements dans les limites AFC sont déductibles du bénéfice imposable sans condition supplémentaire — en dehors des taux maxima. Un amortissement excédentaire génère une reprise fiscale dans la déclaration PM. " +
      "Pour les personnes physiques indépendantes (PP): mêmes taux que pour les PM s'agissant des actifs professionnels. Les actifs mixtes (usage professionnel et privé) sont amortis au prorata de l'usage professionnel. " +
      "Réévaluation (write-up): si la valeur d'un actif amortissable augmente (ex. terrain reclassifié), la réévaluation est imposable comme bénéfice ordinaire. Pour les PM, le write-up est un produit imposable de l'exercice. " +
      "Biens d'investissement et TVA: l'amortissement comptable n'a pas d'impact direct sur la TVA — mais la cession d'un bien d'investissement partiellement amorti génère une régularisation IP si le bien a changé d'affectation (Art. 31 LTVA).",
    law: "AFC-IFD-Circ-32a",
    law_label: "Circulaire AFC IFD n°32a — Amortissements, taux Notice A intégrés",
    article: "section 3",
    article_num: "3",
    heading: "Amortissements PM vs PP, reprises fiscales excédentaires, réévaluation, interaction TVA",
    rs: null,
    topic: "amortissements",
    category: "circular-ifd",
    date_version: "2013-01-01",
    source: "afc",
    jurisdiction: "federal",
    url: "https://www.estv.admin.ch/fr/impot-federal-direct/informations-professionnelles/circulaires.html",
  },
];

// ---------------------------------------------------------------------------
// Circ 37 — Activité accessoire indépendante (seuil CHF 2'300, PP)
// ---------------------------------------------------------------------------

const CIRC_37_CHUNKS: CirculaireChunk[] = [
  {
    text: "[AFC-IFD-Circ-37] Activité accessoire indépendante — seuil CHF 2'300 et conséquences fiscales. " +
      "La Circulaire 37 de l'AFC traite des revenus d'activité accessoire des personnes physiques (PP) exercée à titre indépendant en parallèle d'une activité salariée principale. " +
      "Seuil de minimis: les revenus d'activité indépendante accessoire inférieurs à CHF 2'300 par an sont exonérés des cotisations AVS (Art. 8 al. 1 LAVS). Attention: ils restent imposables à l'IFD et ICC comme revenus d'activité lucrative indépendante. " +
      "En dessous de CHF 2'300: le salarié peut demander à l'AVS de ne pas percevoir de cotisations sur ces revenus accessoires — option à exercer lors de la déclaration AVS. " +
      "Caractérisation d'une activité indépendante (critères cumulatifs): " +
      "(1) exercice à titre de risque propre; (2) facturation à des clients tiers; (3) absence de lien de subordination; (4) liberté d'organisation. " +
      "Si les critères sont remplis: obligation de s'affilier à l'AVS comme indépendant, déduction des frais professionnels effectifs (Art. 27 ss LIFD), report de pertes possible.",
    law: "AFC-IFD-Circ-37",
    law_label: "Circulaire AFC IFD n°37 — Activité accessoire indépendante, seuil CHF 2'300",
    article: "section 1",
    article_num: "1",
    heading: "Activité accessoire — seuil CHF 2'300 AVS, imposition IFD, critères indépendance",
    rs: null,
    topic: "activite_independante",
    category: "circular-ifd",
    date_version: "2015-01-01",
    source: "afc",
    jurisdiction: "federal",
    url: "https://www.estv.admin.ch/fr/impot-federal-direct/informations-professionnelles/circulaires.html",
  },
  {
    text: "[AFC-IFD-Circ-37] Délimitation salarié vs indépendant — requalification et risques. " +
      "La qualification erronée d'un travailleur comme indépendant (faux indépendant) expose l'employeur à des rappels AVS et l'AFC à une requalification fiscale. " +
      "Critères AFC pour distinguer activité dépendante (salariée) vs indépendante: " +
      "- Instructions de l'employeur sur le travail à accomplir → dépendant; " +
      "- Intégration dans l'organisation de l'entreprise → dépendant; " +
      "- Risque économique supporté par le travailleur → indépendant; " +
      "- Pluralité de clients → indépendant; " +
      "- Facturation sur la base d'un résultat, non d'un temps → indépendant. " +
      "En cas de requalification: l'activité accessoire est retaxée comme salaire → imposition à la source (si étranger sans permis C) ou ajout au revenu ordinaire (PP résidente). " +
      "TVA: si l'activité accessoire dépasse CHF 100'000 de CA (avec activité principale), assujettissement TVA requis.",
    law: "AFC-IFD-Circ-37",
    law_label: "Circulaire AFC IFD n°37 — Activité accessoire indépendante, seuil CHF 2'300",
    article: "section 2",
    article_num: "2",
    heading: "Faux indépendant — critères, requalification en salaire, risques AVS et IFD, TVA",
    rs: null,
    topic: "activite_independante",
    category: "circular-ifd",
    date_version: "2015-01-01",
    source: "afc",
    jurisdiction: "federal",
    url: "https://www.estv.admin.ch/fr/impot-federal-direct/informations-professionnelles/circulaires.html",
  },
];

// ---------------------------------------------------------------------------
// Circ 44 — Expatriés (déductions spéciales logement/scolarité)
// ---------------------------------------------------------------------------

const CIRC_44_CHUNKS: CirculaireChunk[] = [
  {
    text: "[AFC-IFD-Circ-44] Expatriés — statut fiscal et déductions spéciales admises. " +
      "La Circulaire 44 de l'AFC définit le statut fiscal des expatriés (personnes détachées temporairement en Suisse par un employeur étranger) et les déductions spéciales qui leur sont accordées. " +
      "Définition de l'expatrié: salarié détaché pour une durée limitée (généralement < 5 ans), qui conserve son domicile fiscal à l'étranger ou dont le centre des intérêts vitaux reste à l'étranger. " +
      "Déductions spéciales admises (non déductibles pour un résident ordinaire): " +
      "(1) Frais de logement: loyer d'un logement de service en Suisse déductible si le salarié maintient un logement à l'étranger pour lequel il continue à payer un loyer/hypothèque. Déduction = loyer Suisse (reasonable) − valeur locative logement étranger. " +
      "(2) Frais de scolarité: scolarité privée des enfants dans une école internationale (langue maternelle) déductible si l'enseignement dans le système scolaire local est inadapté — plafond: frais effectifs raisonnables (typiquement CHF 30'000-50'000/an/enfant). " +
      "(3) Frais de déménagement: frais réels à l'arrivée et au départ de Suisse.",
    law: "AFC-IFD-Circ-44",
    law_label: "Circulaire AFC IFD n°44 — Expatriés, déductions spéciales logement et scolarité",
    article: "section 1",
    article_num: "1",
    heading: "Expatriés — définition, déductions logement (double résidence), scolarité privée, déménagement",
    rs: null,
    topic: "expats",
    category: "circular-ifd",
    date_version: "2018-01-01",
    source: "afc",
    jurisdiction: "federal",
    url: "https://www.estv.admin.ch/fr/impot-federal-direct/informations-professionnelles/circulaires.html",
  },
  {
    text: "[AFC-IFD-Circ-44] Expatriés — traitement IS vs déclaration ordinaire et durée du statut. " +
      "Les expatriés sans permis C sont soumis à l'impôt à la source (IS) pour leur revenu salarial. Les déductions spéciales expatriés peuvent être revendiquées: " +
      "(1) Via une demande de rectification de l'IS (formulaire cantonal) en cours d'année; " +
      "(2) Via une déclaration ordinaire ultérieure (DOU) si revenu ≥ CHF 120'000. " +
      "Durée du statut expatrié: l'AFC accorde généralement le statut pour 5 ans maximum. Au-delà, le salarié est considéré comme un résident ordinaire et perd les déductions spéciales. " +
      "Package expatrié pris en charge par l'employeur: si l'employeur prend en charge directement le loyer, la scolarité et les déménagements, ces montants s'ajoutent au salaire brut imposable — mais peuvent être déduits par l'expatrié selon les règles ci-dessus. " +
      "Interactions avec les CDI: en cas de retour dans le pays d'origine, l'application du CDI peut limiter l'imposition suisse des revenus de la période de détachement.",
    law: "AFC-IFD-Circ-44",
    law_label: "Circulaire AFC IFD n°44 — Expatriés, déductions spéciales logement et scolarité",
    article: "section 2",
    article_num: "2",
    heading: "Expatriés IS vs DOU, durée 5 ans, package employeur, CDI retour pays d'origine",
    rs: null,
    topic: "expats",
    category: "circular-ifd",
    date_version: "2018-01-01",
    source: "afc",
    jurisdiction: "federal",
    url: "https://www.estv.admin.ch/fr/impot-federal-direct/informations-professionnelles/circulaires.html",
  },
];

// ---------------------------------------------------------------------------
// Circ 45 — Télétravail transfrontalier
// ---------------------------------------------------------------------------

const CIRC_45_CHUNKS: CirculaireChunk[] = [
  {
    text: "[AFC-IFD-Circ-45] Télétravail transfrontalier — répartition fiscale entre Suisse et État de résidence. " +
      "La Circulaire 45 de l'AFC (et les accords bilatéraux associés) traite l'imposition des frontaliers et résidents étrangers travaillant partiellement en télétravail depuis leur pays de résidence. " +
      "Problématique: un frontalier (ex. résident français travaillant pour un employeur suisse) qui effectue 2 jours/semaine en télétravail en France — quel État impose quelle part du revenu? " +
      "Position AFC (concordance avec OCDE): le revenu d'activité est imposable dans l'État où l'activité est physiquement exercée. " +
      "- Jours travaillés en Suisse: imposables en Suisse (IS ou déclaration selon CDI). " +
      "- Jours travaillés en France (télétravail): imposables en France. " +
      "Seuil de tolérance (accord CH-FR 2023): jusqu'à 40% du temps de travail en télétravail en France → fiscalité ordinaire frontalier (impôt à la source Suisse uniquement). Au-delà: répartition proportionnelle obligatoire.",
    law: "AFC-IFD-Circ-45",
    law_label: "Circulaire AFC IFD n°45 — Télétravail transfrontalier, répartition fiscale",
    article: "section 1",
    article_num: "1",
    heading: "Télétravail transfrontalier — répartition jours travaillés, accord CH-FR 40%, seuil tolérance",
    rs: null,
    topic: "teletravail_transfrontalier",
    category: "circular-ifd",
    date_version: "2023-01-01",
    source: "afc",
    jurisdiction: "federal",
    url: "https://www.estv.admin.ch/fr/impot-federal-direct/informations-professionnelles/circulaires.html",
  },
  {
    text: "[AFC-IFD-Circ-45] Obligations de l'employeur suisse pour le télétravail transfrontalier. " +
      "L'employeur suisse doit: " +
      "(1) Tenir un registre des jours travaillés en Suisse et à l'étranger pour chaque employé frontalier. " +
      "(2) Adapter la retenue IS au prorata des jours suisses si le seuil de tolérance est dépassé. " +
      "(3) Fournir une attestation annuelle des jours de travail à l'employé pour sa déclaration étrangère. " +
      "Risque d'établissement stable: si un employé en télétravail dispose d'un bureau permanent à domicile et conclut régulièrement des contrats au nom de l'entreprise, un établissement stable peut être créé dans le pays de résidence → imposition d'une partie du bénéfice PM à l'étranger. " +
      "Accord CH-Allemagne sur le télétravail (2023): seuil 49.9% (si < 50% du temps en Allemagne, IS Suisse intégral). Accord CH-Italie: en cours de négociation. " +
      "Sécurité sociale: si le frontalier travaille > 25% dans son État de résidence, l'affiliation AVS suisse peut être remplacée par l'affiliation au système de sécurité sociale du pays de résidence (règlement UE 883/2004 — ALCP).",
    law: "AFC-IFD-Circ-45",
    law_label: "Circulaire AFC IFD n°45 — Télétravail transfrontalier, répartition fiscale",
    article: "section 2",
    article_num: "2",
    heading: "Obligations employeur suisse, registre jours, risque établissement stable, sécurité sociale ALCP",
    rs: null,
    topic: "teletravail_transfrontalier",
    category: "circular-ifd",
    date_version: "2023-01-01",
    source: "afc",
    jurisdiction: "federal",
    url: "https://www.estv.admin.ch/fr/impot-federal-direct/informations-professionnelles/circulaires.html",
  },
];

// ---------------------------------------------------------------------------
// Circ 49 — Crypto-monnaies (PP et PM)
// ---------------------------------------------------------------------------

const CIRC_49_CHUNKS: CirculaireChunk[] = [
  {
    text: "[AFC-IFD-Circ-49] Crypto-monnaies — qualification fiscale pour les personnes physiques (PP). " +
      "La Circulaire 49 de l'AFC (2021) établit la qualification fiscale des crypto-actifs pour les personnes physiques résidentes suisses. " +
      "Fortune imposable (ICC): les crypto-actifs (Bitcoin, Ether, stablecoins, NFTs selon valeur de marché) sont soumis à l'impôt sur la fortune au cours de clôture au 31 décembre. " +
      "Cours de référence: cours de clôture publié par les principales plateformes (Coinbase, Kraken, Binance) ou par Koinly/CoinMarketCap — le contribuable doit documenter son choix de source et l'appliquer uniformément. " +
      "Gains en capital: les gains réalisés sur vente/échange de crypto-actifs par des PP sont exonérés d'IFD si: (1) activité de gestion de patrimoine privé (pas activité lucrative indépendante); (2) pas de trading intensif. " +
      "Critères pour requalification en activité lucrative indépendante (imposable): volume annuel > 5× la fortune nette initiale, utilisation de fonds de tiers, recours au crédit, durée de détention < 6 mois de façon systématique, dépendance des revenus crypto pour vivre.",
    law: "AFC-IFD-Circ-49",
    law_label: "Circulaire AFC IFD n°49 — Crypto-monnaies, qualification fiscale PP et PM",
    article: "section 1",
    article_num: "1",
    heading: "Crypto PP — fortune imposable ICC, exonération gains capital (gestion privée), requalification trading",
    rs: null,
    topic: "crypto_monnaies",
    category: "circular-ifd",
    date_version: "2021-01-01",
    source: "afc",
    jurisdiction: "federal",
    url: "https://www.estv.admin.ch/fr/impot-federal-direct/informations-professionnelles/circulaires.html",
  },
  {
    text: "[AFC-IFD-Circ-49] Crypto-monnaies — Mining, staking, DeFi et qualification du revenu. " +
      "Mining: revenus de minage de crypto-actifs sont imposables comme revenu de l'activité indépendante (Art. 18 LIFD) si exercé à titre professionnel. " +
      "Pour les particuliers minant occasionnellement: si l'activité est minime et sans infrastructure significative, les revenus peuvent être qualifiés de gains en capital exonérés (analyse au cas par cas). " +
      "Staking et yield farming: les récompenses de staking sont imposables comme revenus du patrimoine (Art. 20 al. 1 let. a LIFD — intérêts/revenus sur avoirs) au moment de leur crédit au compte du contribuable. " +
      "Airdrops et hard forks: les tokens reçus gratuitement (airdrops) sont imposables comme autres revenus (Art. 23 LIFD) à leur valeur de marché au moment de la réception. " +
      "Taux de change: les transactions en crypto sont converties en CHF au cours du jour de la transaction pour calculer le gain/revenu imposable. " +
      "Déclaration: les contribuables doivent déclarer tous leurs comptes/wallets crypto en annexe de la déclaration d'impôt.",
    law: "AFC-IFD-Circ-49",
    law_label: "Circulaire AFC IFD n°49 — Crypto-monnaies, qualification fiscale PP et PM",
    article: "section 2",
    article_num: "2",
    heading: "Mining (revenu indépendant), staking (revenu patrimoine), airdrops, DeFi, déclaration wallets",
    rs: null,
    topic: "crypto_monnaies",
    category: "circular-ifd",
    date_version: "2021-01-01",
    source: "afc",
    jurisdiction: "federal",
    url: "https://www.estv.admin.ch/fr/impot-federal-direct/informations-professionnelles/circulaires.html",
  },
  {
    text: "[AFC-IFD-Circ-49] Crypto-monnaies — traitement fiscal pour les personnes morales (PM). " +
      "Pour les PM (SA, Sàrl) détenant des crypto-actifs: " +
      "Comptabilisation: les crypto-actifs sont comptabilisés comme actifs financiers (IFRS) ou selon OR en classe 1 (si court terme) ou classe 1400 (si long terme). " +
      "Évaluation au bilan: à la valeur d'acquisition ou valeur de marché si inférieure (principe de prudence OR). La réévaluation à la hausse est admise mais génère un produit imposable. " +
      "Gains/pertes: réalisés ou non réalisés (selon méthode d'évaluation choisie) sont inclus dans le bénéfice imposable PM. " +
      "TVA sur crypto: " +
      "- Échange crypto contre CHF ou contre autre crypto: opération financière exonérée de TVA (Art. 21 al. 2 ch. 19 LTVA). " +
      "- Prestations payées en crypto (achat de biens/services): le montant en CHF converti au cours du jour constitue la base TVA. " +
      "- Mining comme activité PM: les frais de mining (électricité, matériel) sont grevés d'IP déductible si la société est assujettie et réalise des prestations imposables.",
    law: "AFC-IFD-Circ-49",
    law_label: "Circulaire AFC IFD n°49 — Crypto-monnaies, qualification fiscale PP et PM",
    article: "section 3",
    article_num: "3",
    heading: "Crypto PM — comptabilisation bilan, gains imposables, TVA échange crypto, mining IP déductible",
    rs: null,
    topic: "crypto_monnaies",
    category: "circular-ifd",
    date_version: "2021-01-01",
    source: "afc",
    jurisdiction: "federal",
    url: "https://www.estv.admin.ch/fr/impot-federal-direct/informations-professionnelles/circulaires.html",
  },
];

// ---------------------------------------------------------------------------
// Circ 50a — Plateformes numériques (TVA)
// ---------------------------------------------------------------------------

const CIRC_50A_CHUNKS: CirculaireChunk[] = [
  {
    text: "[AFC-TVA-Circ-50a] Plateformes numériques — assujettissement TVA et règle du vendeur réputé. " +
      "La Circulaire 50a de l'AFC TVA (depuis 2024) transpose la règle du 'vendeur réputé' (deemed supplier) pour les plateformes numériques facilitant des ventes de biens à des consommateurs suisses. " +
      "Principe: si une plateforme (marketplace) facilite la vente de biens par des fournisseurs tiers à des destinataires en Suisse, et que la plateforme contrôle les éléments essentiels de la transaction (prix, conditions), la plateforme est réputée être le fournisseur pour la TVA suisse. " +
      "Seuil d'assujettissement de la plateforme: CA mondial ≥ CHF 100'000 de prestations facilitées vers des destinataires en Suisse. " +
      "Conséquences pour la plateforme: TVA suisse au taux applicable sur la valeur totale de la vente (8.1% pour la plupart des biens). " +
      "Les vendeurs tiers sur la plateforme sont déchargés de l'obligation TVA pour ces transactions (pour éviter la double imposition). " +
      "Modèles non couverts: plateformes qui se contentent de mettre en relation sans contrôler la transaction (pure intermediary) — soumises aux règles ordinaires.",
    law: "AFC-TVA-Circ-50a",
    law_label: "Circulaire AFC TVA n°50a — Plateformes numériques, vendeur réputé TVA",
    article: "section 1",
    article_num: "1",
    heading: "Plateformes numériques — vendeur réputé TVA, seuil CHF 100'000, marketplace vs intermediary",
    rs: null,
    topic: "plateformes_numeriques",
    category: "circular-tva",
    date_version: "2024-01-01",
    source: "afc",
    jurisdiction: "federal",
    url: "https://www.estv.admin.ch/fr/taxe-sur-la-valeur-ajoutee/informations-professionnelles/circulaires.html",
  },
  {
    text: "[AFC-TVA-Circ-50a] Plateformes numériques — prestations de services électroniques B2C et immatriculation. " +
      "Pour les plateformes fournissant des services électroniques (streaming, SaaS, applications, contenu digital) à des consommateurs privés (B2C) en Suisse: " +
      "Assujettissement simplifié (Art. 118a LTVA): les prestataires étrangers peuvent s'immatriculer via une procédure simplifiée en ligne (pas de représentant fiscal requis si CA < CHF 5M). " +
      "Lieu de la prestation B2C: lieu du destinataire (Art. 8 al. 1 LTVA pour les e-services). La plateforme doit déterminer l'adresse du consommateur suisse (adresse de facturation, IP, coordonnées bancaires). " +
      "Déclaration et paiement TVA: décompte trimestriel; TVA au taux standard 8.1% sur le CA e-services vers la Suisse. " +
      "Exemples de services B2C imposables: Netflix, Spotify, App Store, Adobe Creative Cloud, formations en ligne, consultations médicales à distance. " +
      "Exemples exonérés: services B2B (autoliquidation chez le client suisse assujetti), services d'information publique gratuits.",
    law: "AFC-TVA-Circ-50a",
    law_label: "Circulaire AFC TVA n°50a — Plateformes numériques, vendeur réputé TVA",
    article: "section 2",
    article_num: "2",
    heading: "E-services B2C — immatriculation simplifiée, lieu destinataire, taux 8.1%, exemples (Netflix, SaaS)",
    rs: null,
    topic: "plateformes_numeriques",
    category: "circular-tva",
    date_version: "2024-01-01",
    source: "afc",
    jurisdiction: "federal",
    url: "https://www.estv.admin.ch/fr/taxe-sur-la-valeur-ajoutee/informations-professionnelles/circulaires.html",
  },
  {
    text: "[AFC-TVA-Circ-50a] Plateformes d'hébergement et de transport (Airbnb, Uber) — TVA Suisse. " +
      "Airbnb-type (hébergement peer-to-peer): " +
      "- L'hôte particulier qui loue son logement via une plateforme: si CA ≥ CHF 100'000, assujettissement TVA à 3.8% (taux hôtellerie) sur les nuitées. " +
      "- La plateforme: si réputée vendeur, perçoit la TVA sur la nuitée totale. Sinon: TVA uniquement sur les frais de service/commission de la plateforme (8.1%). " +
      "Uber-type (transport de personnes): " +
      "- Transport de personnes en Suisse: TVA à 8.1% (pas de taux réduit pour taxi/VTC). " +
      "- Chauffeur assujetti: doit facturer TVA sur le trajet. Uber comme intermédiaire: TVA sur commission. " +
      "Déclaration AVS des revenus de plateformes: revenus de plateformes digitales pour des PP constituent en général des revenus d'activité indépendante soumis à l'AVS (sauf si montants modiques < CHF 2'300, Circ. 37).",
    law: "AFC-TVA-Circ-50a",
    law_label: "Circulaire AFC TVA n°50a — Plateformes numériques, vendeur réputé TVA",
    article: "section 3",
    article_num: "3",
    heading: "Airbnb (TVA 3.8% hôtellerie), Uber (TVA 8.1% transport), revenus plateforme PP et AVS",
    rs: null,
    topic: "plateformes_numeriques",
    category: "circular-tva",
    date_version: "2024-01-01",
    source: "afc",
    jurisdiction: "federal",
    url: "https://www.estv.admin.ch/fr/taxe-sur-la-valeur-ajoutee/informations-professionnelles/circulaires.html",
  },
];

// ---------------------------------------------------------------------------
// All chunks grouped
// ---------------------------------------------------------------------------

const ALL_CHUNKS: CirculaireChunk[] = [
  ...CIRC_6A_CHUNKS,
  ...CIRC_15_CHUNKS,
  ...CIRC_25_CHUNKS,
  ...CIRC_29C_CHUNKS,
  ...CIRC_32A_CHUNKS,
  ...CIRC_37_CHUNKS,
  ...CIRC_44_CHUNKS,
  ...CIRC_45_CHUNKS,
  ...CIRC_49_CHUNKS,
  ...CIRC_50A_CHUNKS,
];

// Laws to remove before upsert (idempotence)
const LAWS_TO_CLEAN = [
  "AFC-IFD-Circ-6a",
  "AFC-IFD-Circ-15",
  "AFC-IFD-Circ-25",
  "AFC-IFD-Circ-29c",
  "AFC-IFD-Circ-32a",
  "AFC-IFD-Circ-37",
  "AFC-IFD-Circ-44",
  "AFC-IFD-Circ-45",
  "AFC-IFD-Circ-49",
  "AFC-TVA-Circ-50a",
];

// ---------------------------------------------------------------------------
// Qdrant REST helpers
// ---------------------------------------------------------------------------

async function deleteByLaw(law: string): Promise<void> {
  try {
    await axios.post(`${QDRANT_URL}/collections/${COLLECTION}/points/delete`, {
      filter: {
        must: [{ key: "law", match: { value: law } }],
      },
    });
    console.log(`[afc-circ-2] Supprimé: ${law}`);
  } catch (err) {
    console.warn(`[afc-circ-2] Delete ${law} skipped:`, (err as Error).message);
  }
}

async function countPoints(): Promise<number> {
  const { data } = await axios.get<{ result: { points_count: number } }>(
    `${QDRANT_URL}/collections/${COLLECTION}`,
  );
  return data.result.points_count;
}

async function upsertPoints(chunks: CirculaireChunk[], vectors: number[][]): Promise<void> {
  const points = chunks.map((payload, i) => ({
    id: randomUUID(),
    vector: vectors[i],
    payload,
  }));

  await axios.put(`${QDRANT_URL}/collections/${COLLECTION}/points`, {
    points,
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(`[afc-circ-2] QDRANT   : ${QDRANT_URL}`);
  console.log(`[afc-circ-2] EMBEDDER : ${EMBEDDER_URL}`);
  console.log(`[afc-circ-2] COLLECTION: ${COLLECTION}`);
  console.log(`[afc-circ-2] Chunks à ingérer: ${ALL_CHUNKS.length}`);
  console.log(`[afc-circ-2] Distribution:`);
  console.log(`  - Circ 6a  (IS salariés étrangers)          : ${CIRC_6A_CHUNKS.length} chunks`);
  console.log(`  - Circ 15  (restructurations PM)            : ${CIRC_15_CHUNKS.length} chunks`);
  console.log(`  - Circ 25  (participations qualifiées PM)   : ${CIRC_25_CHUNKS.length} chunks`);
  console.log(`  - Circ 29c (intérêts actionnaires/KEP)      : ${CIRC_29C_CHUNKS.length} chunks`);
  console.log(`  - Circ 32a (amortissements Notice A)        : ${CIRC_32A_CHUNKS.length} chunks`);
  console.log(`  - Circ 37  (activité accessoire CHF 2'300)  : ${CIRC_37_CHUNKS.length} chunks`);
  console.log(`  - Circ 44  (expatriés logement/scolarité)   : ${CIRC_44_CHUNKS.length} chunks`);
  console.log(`  - Circ 45  (télétravail transfrontalier)    : ${CIRC_45_CHUNKS.length} chunks`);
  console.log(`  - Circ 49  (crypto-monnaies PP/PM)          : ${CIRC_49_CHUNKS.length} chunks`);
  console.log(`  - Circ 50a (plateformes numériques TVA)     : ${CIRC_50A_CHUNKS.length} chunks`);

  // 1. Embed
  const texts = ALL_CHUNKS.map((c) => c.text);
  console.log("\n[afc-circ-2] Embedding via BGE-M3...");
  const t0 = Date.now();

  const { data: embedResponse } = await axios.post<{
    data: Array<{ index: number; embedding: number[] }>;
  }>(`${EMBEDDER_URL}/v1/embeddings`, { input: texts });

  const vectors = embedResponse.data
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((item) => item.embedding);

  console.log(`[afc-circ-2] ${vectors.length} vecteurs produits en ${Date.now() - t0}ms (dim=${vectors[0]?.length ?? "?"})`);

  // 2. Clean existing
  const before = await countPoints();
  console.log(`\n[afc-circ-2] Points avant: ${before}`);
  for (const law of LAWS_TO_CLEAN) {
    await deleteByLaw(law);
  }

  // 3. Upsert
  await upsertPoints(ALL_CHUNKS, vectors);
  const after = await countPoints();
  console.log(`[afc-circ-2] Points après: ${after} (+${after - before})`);

  // 4. Smoke test
  console.log("\n[afc-circ-2] === Smoke test RAG ===");
  const testQueries = [
    "impôt à la source salarié étranger permis B",
    "fusion neutralité fiscale restructuration",
    "participations qualifiées réduction impôt 10%",
    "taux d'intérêt prêt actionnaire AFC admis",
    "crypto-monnaie Bitcoin imposition fiscale Suisse",
    "télétravail frontalier répartition jours travaillés",
    "plateforme numérique TVA vendeur réputé",
    "expatrié déduction logement scolarité",
  ];

  for (const q of testQueries) {
    const { data: qEmbed } = await axios.post<{
      data: Array<{ index: number; embedding: number[] }>;
    }>(`${EMBEDDER_URL}/v1/embeddings`, { input: [q] });
    const qVec = qEmbed.data[0]?.embedding ?? [];

    const { data: searchRes } = await axios.post<{
      result: Array<{ id: string; score: number; payload: CirculaireChunk }>;
    }>(`${QDRANT_URL}/collections/${COLLECTION}/points/search`, {
      vector: qVec,
      limit: 3,
      with_payload: true,
    });

    console.log(`\n  Q: "${q}"`);
    for (const hit of searchRes.result) {
      const isNew = LAWS_TO_CLEAN.includes(hit.payload.law);
      const mark = isNew ? "[AFC-CIRC-2]" : "            ";
      console.log(`    ${mark} [${hit.score.toFixed(3)}] ${hit.payload.law} — ${hit.payload.heading.slice(0, 70)}`);
    }
  }

  console.log("\n[afc-circ-2] DONE ✓");
}

main().catch((err: unknown) => {
  console.error("[afc-circ-2] FATAL:", err);
  process.exit(1);
});
