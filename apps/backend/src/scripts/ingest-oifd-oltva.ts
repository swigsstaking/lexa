#!/usr/bin/env node
/**
 * ingest-oifd-oltva — Ingère les ordonnances OIFD et OLTVA dans Qdrant.
 *
 * OIFD : Ordonnance sur l'impôt fédéral direct (RS 642.116)
 * OLTVA: Ordonnance sur la taxe sur la valeur ajoutée (RS 641.201)
 *
 * Exécution (depuis apps/backend/) :
 *   npx tsx src/scripts/ingest-oifd-oltva.ts
 *   QDRANT_URL=http://192.168.110.103:6333 EMBEDDER_URL=http://192.168.110.103:8001 npx tsx src/scripts/ingest-oifd-oltva.ts
 *
 * Stratégie :
 *   - Supprime d'abord les points existants (idempotent)
 *   - Articles clés hardcodés avec résumés denses ~200-400 tokens pour RAG
 *   - Embedde via BGE-M3 (port 8082)
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

interface LawChunk {
  text: string;
  law: string;
  rs: string;
  article: string;
  title: string;
  topic: string[];
  jurisdiction: string;
  effective_from: string;
}

// ---------------------------------------------------------------------------
// OIFD — Ordonnance sur l'impôt fédéral direct (RS 642.116)
// ---------------------------------------------------------------------------

const OIFD_CHUNKS: LawChunk[] = [
  // Art. 1-5 : Champ d'application, contribuables
  {
    text: "[OIFD Art. 1-3] Champ d'application et contribuables assujettis à l'IFD. " +
      "L'Ordonnance sur l'impôt fédéral direct (OIFD, RS 642.116) précise les règles d'exécution de la LIFD (RS 642.11). " +
      "Art. 1: L'ordonnance régit l'assujettissement des personnes physiques (PP) résidant en Suisse, des personnes morales (PM) ayant leur siège ou administration effective en Suisse, ainsi que des personnes économiquement rattachées. " +
      "Art. 2: L'assujettissement illimité des PP couvre l'ensemble du revenu mondial et de la fortune; l'assujettissement limité des non-résidents couvre uniquement les revenus de source suisse (immeubles, établissements stables, activités). " +
      "Art. 3: Les contribuables PP sont imposés sur le revenu net (revenu brut moins déductions admises: frais professionnels Art. 27-32, déductions générales Art. 33-38). " +
      "Art. 4: Début et fin de l'assujettissement en cours d'année — proratisation temporelle. " +
      "Art. 5: Assujettissement limité des personnes morales étrangères ayant un établissement stable en Suisse: imposées sur les bénéfices attribuables à l'établissement stable selon méthode d'attribution directe ou indirecte.",
    law: "OIFD",
    rs: "642.116",
    article: "1-5",
    title: "Champ d'application et assujettissement PP/PM — résidence et rattachement économique",
    topic: ["oifd", "assujettissement", "contribuables", "residences"],
    jurisdiction: "federal",
    effective_from: "2024-01-01",
  },
  {
    text: "[OIFD Art. 4-5] Assujettissement partiel et rattachement économique. " +
      "L'assujettissement limité concerne les PP non résidentes percevant des revenus de source suisse: " +
      "(1) propriétaires d'immeubles en Suisse (revenus locatifs, valeur locative, gains immobiliers selon droit cantonal); " +
      "(2) exploitants d'un établissement stable ou d'une entreprise en Suisse; " +
      "(3) bénéficiaires de salaires versés par des employeurs suisses (impôt à la source Circ. 6a AFC); " +
      "(4) détenteurs de participations dans des sociétés suisses (dividendes soumis à IA 35%, récupérable selon CDI). " +
      "L'OIFD précise les règles de répartition intercantonale pour les contribuables multi-cantonaux: bénéfice des PM réparti selon clés de répartition (capital, salaires, chiffre d'affaires). " +
      "La domiciliation fictive ('boîte aux lettres') ne suffit pas à l'assujettissement illimité — critère de résidence effective ou administration effective requis.",
    law: "OIFD",
    rs: "642.116",
    article: "4-5",
    title: "Assujettissement limité — rattachement économique, établissements stables, répartition intercantonale",
    topic: ["oifd", "assujettissement", "etablissement_stable", "repartition_intercantonale"],
    jurisdiction: "federal",
    effective_from: "2024-01-01",
  },

  // Art. 27-32 : Frais professionnels déductibles
  {
    text: "[OIFD Art. 27-29] Frais professionnels des salariés — déductions admises IFD. " +
      "Art. 27 OIFD (en lien avec Art. 26 LIFD): les salariés peuvent déduire leurs frais professionnels selon méthode forfaitaire ou réelle. " +
      "Déduction forfaitaire générale (2024): CHF 3'000 pour frais divers (repas hors domicile, vêtements professionnels, outils, formation continue usuelle). Ce forfait couvre tous les frais professionnels courants non listés séparément. " +
      "Art. 28: Frais de transport domicile-travail: transport public déductible intégralement (abonnement CFF, etc.); véhicule privé plafonné à CHF 3'000 par an (forfait IFD, Art. 26 al. 1 let. a LIFD). " +
      "Art. 29: Frais de repas hors domicile: CHF 15/jour si pas de cantine (CHF 7.50 si cantine/chèques repas). Plafond annuel CHF 3'200. " +
      "Frais réels admis si documentés et dépassant les forfaits — charge de la preuve sur le contribuable.",
    law: "OIFD",
    rs: "642.116",
    article: "27-29",
    title: "Frais professionnels salariés — forfaits transport, repas et déductions générales",
    topic: ["oifd", "frais_professionnels", "deduction", "forfait", "salaries"],
    jurisdiction: "federal",
    effective_from: "2024-01-01",
  },
  {
    text: "[OIFD Art. 30-32] Frais professionnels indépendants et travailleurs à domicile. " +
      "Art. 30 OIFD: les indépendants (activité lucrative indépendante Art. 18 LIFD) déduisent les frais effectivement nécessaires à l'acquisition du revenu: " +
      "loyers de locaux professionnels, salaires du personnel, cotisations AVS/LPP, matières premières, frais de déplacement professionnels, frais de représentation justifiés, amortissements selon Notice A/1995. " +
      "Art. 31: bureau à domicile déductible si pièce exclusivement professionnelle (aucun usage privé). Déduction: proportion surface bureau/surface totale × loyer + charges. " +
      "Si activité mixte dans la même pièce: aucune déduction possible (règle stricte AFC). " +
      "Art. 32: formation et perfectionnement professionnels: déductibles sans plafond si liés à l'activité actuelle. Reconversion: jusqu'à CHF 12'000 (Art. 33 al. 1 let. j LIFD). Limite supérieure pour formation continue auto-financée: même règle.",
    law: "OIFD",
    rs: "642.116",
    article: "30-32",
    title: "Frais professionnels indépendants — bureau domicile, formation, frais effectifs",
    topic: ["oifd", "frais_professionnels", "independants", "bureau_domicile", "formation"],
    jurisdiction: "federal",
    effective_from: "2024-01-01",
  },

  // Art. 33-38 : Déductions générales
  {
    text: "[OIFD Art. 33-35] Déductions générales PP — primes d'assurances et intérêts passifs. " +
      "Art. 33 OIFD / Art. 33 LIFD: déductions générales admises pour les personnes physiques: " +
      "(1) Intérêts passifs (dettes hypothécaires, crédits à la consommation): déductibles à hauteur du revenu de fortune brut + CHF 50'000 (plafond). Intérêts sur dettes liées à l'activité indépendante entièrement déductibles. " +
      "(2) Primes d'assurance-maladie (LAMal) et accidents: personnes seules CHF 1'800, couples CHF 3'600, enfant CHF 900 (plafonds 2024, avec correction si participation aux primes reçue). " +
      "(3) Rentes alimentaires versées ex-conjoint: déductibles si imposées chez le bénéficiaire (Art. 23 let. f LIFD). " +
      "Art. 34: cotisations 3ème pilier (pilier 3a): salarié avec LPP CHF 7'056, indépendant sans LPP CHF 35'280 (2024) = 20% du revenu net. Versement avant 31 décembre pour déduction de l'année. " +
      "Art. 35: dons aux organisations exonérées (ISBL reconnues): 20% du revenu net imposable, minimum CHF 100 par don.",
    law: "OIFD",
    rs: "642.116",
    article: "33-35",
    title: "Déductions générales PP — intérêts passifs, assurances-maladie, pilier 3a, dons",
    topic: ["oifd", "deductions_generales", "assurances", "interets_passifs", "pilier_3a"],
    jurisdiction: "federal",
    effective_from: "2024-01-01",
  },
  {
    text: "[OIFD Art. 36-38] Déductions sociales et déductions pour enfants/personnes à charge. " +
      "Art. 36 OIFD: déduction pour personnes à charge: enfant mineur ou en formation CHF 6'700 par enfant (2024, Art. 35 LIFD). " +
      "Déduction pour personnes nécessiteuses à charge (ascendants, enfants invalides): CHF 2'800 par personne (conditions: cohabitation ou prise en charge effective d'au moins CHF 2'800). " +
      "Art. 37: déduction monoparental (chef de famille isolé): CHF 2'800 si enfant à charge (Art. 35 al. 1 let. c LIFD). " +
      "Art. 38: déduction pour frais de garde d'enfants par des tiers: jusqu'à CHF 25'000 par enfant de moins de 14 ans (Art. 33 al. 3 LIFD) — frais effectifs justifiés par factures. " +
      "Ces déductions s'appliquent après calcul du revenu imposable brut et avant application du barème. " +
      "En cas d'imposition commune (couple marié), les revenus sont additionnés et les déductions doublées pour certains postes.",
    law: "OIFD",
    rs: "642.116",
    article: "36-38",
    title: "Déductions sociales — enfants, personnes à charge, monoparental, garde d'enfants",
    topic: ["oifd", "deductions_sociales", "enfants", "famille", "garde"],
    jurisdiction: "federal",
    effective_from: "2024-01-01",
  },

  // Art. 60-64 : Amortissements
  {
    text: "[OIFD Art. 60-62] Amortissements admis fiscalement — biens mobiliers et immeubles. " +
      "Art. 60 OIFD: les amortissements sont admis en déduction pour les actifs immobilisés nécessaires à l'acquisition du revenu. Deux méthodes: " +
      "(1) Méthode dégressive (valeur résiduelle): % appliqué sur valeur comptable nette. Taux maxima AFC (Notice A/1995): machines 30%, matériel informatique 40%, véhicules 40%, mobilier 25%, logiciels 40%. " +
      "(2) Méthode linéaire: % appliqué sur coût d'acquisition. Taux moitié des taux dégressifs. " +
      "Art. 61: immeubles d'exploitation — bâtiments commerciaux: 4% linéaire ou 7% dégressif. Terrain: jamais amortissable. " +
      "Immeubles mixtes (exploitation + habitation): amortissement admis sur la seule partie commerciale. " +
      "Art. 62: amortissements exceptionnels admis si dépréciation effective démontrée (tests de dépréciation). Amortissements rétroactifs refusés. " +
      "L'amortissement comptabilisé qui dépasse le maximum AFC est une reprise fiscale (réintégration dans le bénéfice imposable PM ou le revenu imposable indépendant PP).",
    law: "OIFD",
    rs: "642.116",
    article: "60-62",
    title: "Amortissements — méthodes dégressive/linéaire, taux AFC maxima, immeubles",
    topic: ["oifd", "amortissements", "notice_a", "immobilisations", "deduction"],
    jurisdiction: "federal",
    effective_from: "2024-01-01",
  },
  {
    text: "[OIFD Art. 63-64] Réserves et provisions admises — règles fiscales. " +
      "Art. 63 OIFD (Art. 63 LIFD): provisions déductibles fiscalement si: (1) commercialement justifiées; (2) vraisemblables au regard des faits connus à la date de clôture; (3) calculables de manière suffisamment précise. " +
      "Provisions admises: garanties sur ventes, litiges en cours, pertes sur contrats déficitaires, provisions pour restructurations (si plan formel décidé). " +
      "Provisions non admises: provisions générales de prudence sans cause précise, réserves latentes déguisées, provisions fiscalement motivées sans substance économique. " +
      "Art. 64: réserves latentes — lors de réalisation (cession, liquidation), les réserves latentes sont imposées. Exception: remploi (report d'imposition si réinvestissement dans un actif de remplacement de même nature dans les 2 ans, Art. 64 LIFD). " +
      "Report de taxation: sociétés en restructuration (fusions, scissions) — voir Circ. 15 AFC pour règles spéciales.",
    law: "OIFD",
    rs: "642.116",
    article: "63-64",
    title: "Provisions déductibles, réserves latentes et report d'imposition (remploi)",
    topic: ["oifd", "provisions", "reserves_latentes", "remploi", "restructuration"],
    jurisdiction: "federal",
    effective_from: "2024-01-01",
  },

  // Art. 80-85 : Bénéfice imposable PM
  {
    text: "[OIFD Art. 80-82] Bénéfice imposable des personnes morales — base de calcul et corrections. " +
      "Art. 80 OIFD: le bénéfice imposable des PM (Art. 58 LIFD) est calculé à partir du résultat net du compte de résultat (OR/Swiss GAAP), corrigé des reprises et déductions fiscales. " +
      "Reprises fiscales (additions au bénéfice comptable): " +
      "- amortissements excessifs (au-delà Notice A); " +
      "- provisions non justifiées; " +
      "- charges non déductibles: impôts sur le bénéfice (Art. 59 al. 1 let. a LIFD), amendes pénales, frais non commerciaux; " +
      "- prestations appréciables en argent (Circ. 24 AFC). " +
      "Déductions du bénéfice comptable: " +
      "- réduction pour participations (Art. 69-70 LIFD) si ≥ 10% capital ou valeur ≥ CHF 1M: réduction proportionnelle aux revenus de participations nettes; " +
      "- pertes des 7 exercices antérieurs reportables (Art. 67 LIFD). " +
      "Art. 81: taux IFD PM 8.5% du bénéfice net imposable (taux unique, pas de barème progressif pour PM).",
    law: "OIFD",
    rs: "642.116",
    article: "80-82",
    title: "Bénéfice imposable PM — corrections fiscales, reprises, réduction participations, taux 8.5%",
    topic: ["oifd", "benefice_imposable", "personnes_morales", "corrections_fiscales", "taux_ifd"],
    jurisdiction: "federal",
    effective_from: "2024-01-01",
  },
  {
    text: "[OIFD Art. 83-85] Capital propre imposable des personnes morales et capital propre dissimulé. " +
      "Art. 83 OIFD: le capital propre imposable des PM comprend: capital libéré + réserves légales + réserves libres + bénéfice de l'exercice. " +
      "Capital propre dissimulé (thin capitalisation / Circ. 6a AFC taux d'intérêt): si le ratio dettes/fonds propres dépasse les normes de sécurité AFC (règle de financement sûr), " +
      "la fraction excessive des dettes (en particulier envers actionnaires) est requalifiée en capital propre. " +
      "Conséquences: (1) les intérêts payés sur la part requalifiée sont refusés en déduction (reprise fiscale); (2) la part de capital propre dissimulé est ajoutée au capital imposable (impôt sur le capital cantonal). " +
      "Art. 84: report de pertes sur bénéfice: les pertes des 7 exercices antérieurs sont déductibles du bénéfice de l'exercice courant (FIFO). Le report est perdu en cas de changement d'activité ou de direction économique (règle anti-abus). " +
      "Art. 85: liquidation — imposition du bénéfice de liquidation (Art. 58 al. 1 let. c LIFD), incluant toutes réserves latentes réalisées.",
    law: "OIFD",
    rs: "642.116",
    article: "83-85",
    title: "Capital propre imposable PM, capital propre dissimulé (thin cap), report de pertes, liquidation",
    topic: ["oifd", "capital_propre", "thin_capitalisation", "report_pertes", "liquidation"],
    jurisdiction: "federal",
    effective_from: "2024-01-01",
  },

  // Art. 95-100 : Procédure de taxation
  {
    text: "[OIFD Art. 95-97] Procédure de taxation IFD — délais et obligations déclaratives. " +
      "Art. 95 OIFD: les contribuables PP ont l'obligation de remettre leur déclaration d'impôt dans le délai fixé par le canton (généralement 31 mars N+1 pour l'exercice N, avec prolongation sur demande). " +
      "Art. 96: pièces justificatives à joindre: certificat de salaire(s) (formulaire AFC), attestations intérêts hypothécaires, relevés LPP/3a, justificatifs frais médicaux, etc. " +
      "Les PM doivent joindre les comptes annuels (bilan + compte de résultat signés) et toutes annexes requises. " +
      "Art. 97: autorité de taxation — les cantons taxent l'IFD pour compte de la Confédération. L'AFC supervise et peut intervenir dans les cas importants. " +
      "Délai de prescription de taxation: 5 ans depuis la fin de la période fiscale pour la taxation ordinaire; 15 ans en cas de soustraction d'impôt. " +
      "Notification de la décision de taxation: le contribuable dispose de 30 jours pour réclamation (Art. 132 LIFD).",
    law: "OIFD",
    rs: "642.116",
    article: "95-97",
    title: "Procédure de taxation — délais déclaratifs, pièces justificatives, autorités, prescription",
    topic: ["oifd", "procedure_taxation", "declaration", "delais", "prescription"],
    jurisdiction: "federal",
    effective_from: "2024-01-01",
  },
  {
    text: "[OIFD Art. 98-100] Taxation d'office, rappel d'impôt et soustraction fiscale. " +
      "Art. 98 OIFD: en l'absence de déclaration dans le délai légal (après rappel), l'autorité procède à une taxation d'office basée sur éléments disponibles (avec majoration de sécurité). " +
      "Le contribuable peut recourir contre la taxation d'office dans les 30 jours — charge de la preuve sur lui. " +
      "Art. 99: rappel d'impôt (Art. 151-153 LIFD): si des éléments imposables n'ont pas été déclarés (découverte dans 10 ans), l'AFC peut procéder au rappel avec intérêts moratoires. " +
      "Amende pour soustraction (Art. 175 LIFD): 1x à 3x l'impôt soustrait. Fraude fiscale (usage de faux, Art. 186 LIFD): emprisonnement jusqu'à 3 ans ou amende. " +
      "Art. 100: dénonciation spontanée non punissable (Art. 175 al. 3 LIFD): le contribuable qui se dénonce avant toute découverte par l'autorité n'est pas puni — seul le rappel d'impôt + intérêts s'appliquent. Conditions: dénonciation complète et sincère, premiers manquements.",
    law: "OIFD",
    rs: "642.116",
    article: "98-100",
    title: "Taxation d'office, rappel d'impôt, soustraction fiscale et dénonciation spontanée",
    topic: ["oifd", "taxation_office", "rappel_impot", "soustraction_fiscale", "denonciation"],
    jurisdiction: "federal",
    effective_from: "2024-01-01",
  },
];

// ---------------------------------------------------------------------------
// OLTVA — Ordonnance sur la TVA (RS 641.201)
// ---------------------------------------------------------------------------

const OLTVA_CHUNKS: LawChunk[] = [
  // Art. 1-10 : Objet, assujettissement, option
  {
    text: "[OLTVA Art. 1-5] Objet et champ d'application de l'ordonnance TVA. " +
      "L'Ordonnance sur la TVA (OLTVA, RS 641.201) précise les dispositions d'exécution de la LTVA (RS 641.20). " +
      "Art. 1 OLTVA: règle les modalités de l'assujettissement, des bases de calcul, des taux et des déductions. " +
      "Art. 2: définitions complémentaires — 'prestation' inclut toute fourniture économique (livraisons de biens, prestations de services, prestations à soi-même). " +
      "Art. 3: territoire suisse — la TVA suisse s'applique aux prestations fournies sur le territoire national. Importations: TVA à l'importation perçue par la Douane (DGD). " +
      "Art. 4: distinction livraisons de biens (transfert du pouvoir de disposer) vs prestations de services (toute prestation non constitutive d'une livraison de bien). " +
      "Art. 5: seuil d'assujettissement obligatoire: chiffre d'affaires mondial provenant de prestations imposables ≥ CHF 100'000 par an (exercice civil ou exercice commercial). " +
      "En-dessous du seuil: assujettissement volontaire possible (Art. 11 LTVA). Calcul pro-rata pour démarrage en cours d'année.",
    law: "OLTVA",
    rs: "641.201",
    article: "1-5",
    title: "Objet OLTVA, champ d'application territorial, seuil assujettissement CHF 100'000",
    topic: ["oltva", "assujettissement", "tva", "seuil", "champ_application"],
    jurisdiction: "federal",
    effective_from: "2024-01-01",
  },
  {
    text: "[OLTVA Art. 6-10] Option TVA, groupes TVA et début/fin d'assujettissement. " +
      "Art. 6 OLTVA: option pour l'assujettissement volontaire — entreprises dont le chiffre d'affaires est inférieur à CHF 100'000 peuvent s'assujettir volontairement. Durée minimale: 3 ans. " +
      "Art. 7: option pour l'imposition des prestations exclues du champ de l'impôt (Art. 22 LTVA) — ex. locations immobilières: le bailleur peut opter pour soumettre loyers à TVA, ce qui lui permet de déduire l'impôt préalable sur les investissements immobiliers. Option irrévocable pour 5 ans minimum. " +
      "Art. 8: groupes TVA — plusieurs entités juridiques peuvent former un groupe TVA unique (consolidation), permettant d'éliminer la TVA sur les prestations intra-groupe. Conditions: contrôle commun ≥ 50%, domicile en Suisse. " +
      "Art. 9: début de l'assujettissement dès que le seuil est atteint ou prévisiblement atteint. Déclaration dans les 30 jours à l'AFC. " +
      "Art. 10: fin d'assujettissement — dès cessation d'activité ou retour durable sous le seuil. Décompte final obligatoire; correction de l'impôt préalable sur stocks et immobilisations.",
    law: "OLTVA",
    rs: "641.201",
    article: "6-10",
    title: "Option TVA volontaire, groupes TVA, début/fin assujettissement et déclaration AFC",
    topic: ["oltva", "option_tva", "groupe_tva", "assujettissement_volontaire"],
    jurisdiction: "federal",
    effective_from: "2024-01-01",
  },

  // Art. 17-25 : Lieu de la prestation
  {
    text: "[OLTVA Art. 17-20] Lieu des prestations de services — règle générale et exceptions. " +
      "Art. 17 OLTVA: règle générale 'lieu du destinataire' (B2B): pour les prestations de services fournies à un assujetti, le lieu de la prestation est le lieu où le destinataire a son domicile commercial ou siège. " +
      "Conséquence: services fournis à des clients à l'étranger = exportation, hors champ TVA suisse (taux 0% ou exonération). " +
      "Services reçus de l'étranger par un assujetti suisse = autoliquidation (Art. 45 LTVA). " +
      "Art. 18: exception — lieu du fournisseur pour: services de restauration et hôtellerie, manifestations culturelles/sportives, transport de personnes. " +
      "Art. 19: services en lien avec un immeuble: lieu de l'immeuble (ex. architecte sur chantier en Suisse = TVA suisse même si prestataire étranger). " +
      "Art. 20: transport de biens: lieu de départ. Pour transport international: exonération si exportation prouvée.",
    law: "OLTVA",
    rs: "641.201",
    article: "17-20",
    title: "Lieu prestation de services — règle destinataire B2B, exceptions restauration/immeuble, autoliquidation",
    topic: ["oltva", "lieu_prestation", "b2b", "exportation", "autoliquidation"],
    jurisdiction: "federal",
    effective_from: "2024-01-01",
  },
  {
    text: "[OLTVA Art. 21-25] Lieu des livraisons de biens et prestations électroniques. " +
      "Art. 21 OLTVA: lieu d'une livraison de bien = lieu où le bien se trouve au moment du transfert du pouvoir de disposer. " +
      "Livraisons avec transport: lieu de départ du transport. Exportation prouvée: taux 0% (Art. 23 al. 2 ch. 1 LTVA). " +
      "Art. 22: prestations électroniques (e-services): lieu du destinataire — si destinataire est une PP (B2C) avec domicile en Suisse, l'assujetti étranger doit s'immatriculer à la TVA suisse si son CA vers des destinataires suisses dépasse CHF 100'000 (plateforme numérique, streaming, logiciels SaaS). " +
      "Art. 23: importation de biens — la TVA à l'importation est perçue par la DGD sur la valeur en douane + frais. L'assujetti récupère cette TVA comme impôt préalable (formulaire 1454). " +
      "Art. 24: prestations combinées — la prestation principale détermine le régime TVA de l'ensemble (règle d'unité de prestation). " +
      "Art. 25: ventes à distance (e-commerce) — plateforme = assujetti réputé pour la TVA sur ventes via plateforme (depuis 2025: seuil CHF 100'000 CA plateforme).",
    law: "OLTVA",
    rs: "641.201",
    article: "21-25",
    title: "Lieu livraisons de biens, prestations électroniques B2C, importations, ventes à distance",
    topic: ["oltva", "lieu_livraison", "e_commerce", "importation", "prestations_electroniques"],
    jurisdiction: "federal",
    effective_from: "2024-01-01",
  },

  // Art. 37-45 : Base de calcul, taux
  {
    text: "[OLTVA Art. 37-40] Base de calcul de la TVA — contre-prestation et éléments inclus. " +
      "Art. 37 OLTVA: la base de calcul est la contre-prestation effectivement reçue (méthode convenue) ou encaissée (méthode des contre-prestations reçues, Art. 39-40 LTVA). " +
      "Inclus dans la base: prix de vente, frais de transport facturés, acomptes reçus, frais annexes. " +
      "Art. 38: éléments exclus de la base: rabais accordés avant exigibilité, emballages consignés restitués, impôts et taxes non inclus dans la contre-prestation (ex. émoluments officiels). " +
      "Art. 39: moment de l'exigibilité TVA: méthode convenue (facturation) = TVA due dès la facturation ou livraison. Méthode des contre-prestations reçues (encaissement) = TVA due dès réception du paiement. Choix de méthode déclaré lors de l'inscription; changement possible sur demande après 3 ans. " +
      "Art. 40: acomptes reçus: TVA exigible dès réception, calculée sur le montant de l'acompte.",
    law: "OLTVA",
    rs: "641.201",
    article: "37-40",
    title: "Base de calcul TVA — contre-prestation, méthode convenue vs encaissement, acomptes",
    topic: ["oltva", "base_calcul", "contre_prestation", "methode_convenue", "exigibilite"],
    jurisdiction: "federal",
    effective_from: "2024-01-01",
  },
  {
    text: "[OLTVA Art. 41-45] Taux TVA applicables en Suisse dès 2024. " +
      "Art. 41 OLTVA: trois taux TVA en vigueur depuis le 1er janvier 2024 (suite à la réforme AVS/AI): " +
      "(1) Taux normal: 8.1% — applicable à toutes les prestations non visées par les taux réduits. " +
      "(2) Taux réduit: 2.6% — denrées alimentaires, médicaments, journaux/périodiques, semences/plants. " +
      "(3) Taux spécial hôtellerie: 3.8% — nuitées avec petit-déjeuner (hébergement seul Art. 25 al. 4 LTVA). " +
      "Art. 42: taux zéro (0%): exportations de biens, transport international, prestations liées à des navires de haute mer — avec droit à déduction complète de l'impôt préalable (contrairement aux prestations exclues). " +
      "Art. 43: prestations exclues du champ (Art. 21 LTVA): soins médicaux, éducation, location immobilière résidentielle, opérations financières — pas de TVA et pas de récupération de l'impôt préalable sur ces activités. " +
      "Art. 44-45: marge TVA bénéficiaire (objets d'art, antiquités, véhicules d'occasion): TVA calculée sur la marge et non sur le prix de vente total.",
    law: "OLTVA",
    rs: "641.201",
    article: "41-45",
    title: "Taux TVA suisses 2024 — 8.1% normal, 2.6% réduit, 3.8% hôtellerie, 0% exportation, prestations exclues",
    topic: ["oltva", "taux_tva", "taux_normal", "taux_reduit", "hotellerie", "exportation"],
    jurisdiction: "federal",
    effective_from: "2024-01-01",
  },

  // Art. 53-60 : Déduction de l'impôt préalable
  {
    text: "[OLTVA Art. 53-56] Déduction de l'impôt préalable — conditions et justificatifs. " +
      "Art. 53 OLTVA: l'impôt préalable (IP) est déductible si: (1) il est facturé par un assujetti sur une facture conforme (Art. 26 LTVA); (2) la dépense est nécessaire à l'activité imposable; (3) l'assujetti est lui-même redevable de la TVA. " +
      "Art. 54: éléments de la facture valide (Art. 26 LTVA): nom et adresse fournisseur, numéro TVA (CHE-xxx.xxx.xxx MWST), date de facturation, description prestation, montant HT, taux TVA applicable, montant TVA. " +
      "Art. 55: correction de l'IP en cas d'usage mixte (Art. 30 LTVA): si un bien ou service est utilisé à la fois pour des activités imposables et exclues/privées, l'IP n'est déductible qu'à hauteur du prorata d'utilisation commerciale imposable. " +
      "Méthodes de calcul du prorata: méthode du chiffre d'affaires (CA imposable / CA total), méthode des surfaces, ou méthode directe selon nature du bien. " +
      "Art. 56: IP sur investissements — biens d'investissement (valeur ≥ CHF 100'000, durée d'utilité ≥ 5 ans): régularisation sur 5 ans si l'utilisation change (Art. 31-32 LTVA).",
    law: "OLTVA",
    rs: "641.201",
    article: "53-56",
    title: "Impôt préalable — conditions de déduction, facture conforme, usage mixte et prorata",
    topic: ["oltva", "impot_prealable", "deduction", "usage_mixte", "facture_tva"],
    jurisdiction: "federal",
    effective_from: "2024-01-01",
  },
  {
    text: "[OLTVA Art. 57-60] Corrections et régularisations de l'impôt préalable. " +
      "Art. 57 OLTVA: régularisation de l'IP sur biens d'investissement (Art. 31 LTVA): si l'utilisation d'un bien change de l'imposable vers l'exclu (ou vice-versa) dans les 5 premières années, une correction annuelle est obligatoire (1/5 de l'IP initial par année de changement). " +
      "Art. 58: correction IP pour usage privé du personnel (prestation à soi-même): la TVA est due sur la valeur de l'avantage accordé au personnel (repas, véhicule, logement). Valeur forfaitaire admise pour repas: CHF 10 (petit-déjeuner) / CHF 20 (lunch/dîner) par repas fourni gratuitement — TVA calculée sur ces montants. " +
      "Art. 59: impôt préalable fictivement déductible — achat auprès de non-assujetti (particulier, exempté): IP fictif admis sur certains biens d'occasion (taux: 8.1/108.1 × prix d'achat). " +
      "Art. 60: remboursement de l'IP excédentaire — si décompte trimestriel/semestriel est créditeur (IP > TVA due), l'AFC rembourse dans les 60 jours suivant la réception du décompte complet.",
    law: "OLTVA",
    rs: "641.201",
    article: "57-60",
    title: "Corrections IP — régularisation 5 ans biens investissement, usage privé personnel, remboursement excédent",
    topic: ["oltva", "regularisation", "impot_prealable", "biens_investissement", "usage_prive"],
    jurisdiction: "federal",
    effective_from: "2024-01-01",
  },

  // Art. 71-80 : Décompte et paiement
  {
    text: "[OLTVA Art. 71-75] Décompte TVA — méthode effective et périodicité. " +
      "Art. 71 OLTVA: méthode effective (standard): l'assujetti déclare la TVA sur toutes ses prestations imposables et déduit l'IP effectivement subi. Décomptes trimestriels (ou semestriels si CA < CHF 5'005'000). " +
      "Art. 72: méthode des taux de la dette fiscale nette (TDFN / méthode des taux forfaitaires): simplification pour PME avec CA ≤ CHF 5'005'000 et dette fiscale ≤ CHF 103'000. La TVA due = CA TVA inclus × taux TDFN sectoriel (varie de 0.1% à 6.5% selon l'activité). Pas de décompte de l'IP réel — forfait tout compris. " +
      "Art. 73: choix de méthode: déclaration lors de l'inscription; changement une fois par an, dès le 1er janvier. Retour à la méthode effective après TDFN = régularisation IP sur biens d'investissement. " +
      "Art. 74: délai de paiement: 60 jours après la fin de la période de décompte. Intérêts moratoires si paiement tardif (taux publié par AFC, env. 4-5%). " +
      "Art. 75: acomptes provisionnels: en méthode effective, les assujettis dont la dette dépasse CHF 100'000/an versent des acomptes.",
    law: "OLTVA",
    rs: "641.201",
    article: "71-75",
    title: "Décompte TVA — méthode effective vs TDFN forfaitaire, périodicité, délais de paiement",
    topic: ["oltva", "decompte_tva", "methode_effective", "tdfn", "periodicite"],
    jurisdiction: "federal",
    effective_from: "2024-01-01",
  },
  {
    text: "[OLTVA Art. 76-80] Méthode du taux forfaitaire et décompte annuel. " +
      "Art. 76 OLTVA: méthode du taux forfaitaire (ancienne MTF, remplacée par TDFN): décompte annuel possible pour les assujettis remplissant les conditions de la TDFN avec paiement d'acomptes trimestriels de 25% de la dette estimée. " +
      "Art. 77: groupes TVA — décompte consolidé mensuel ou trimestriel pour l'ensemble du groupe. Les livraisons intra-groupe sont éliminées (pas de TVA interne). " +
      "Art. 78: décompte final lors de la radiation: toutes les créances/dettes TVA sont soldées. Correction IP sur stocks et immobilisations non encore entièrement amorties. " +
      "Art. 79: procédure d'estimation (taxation d'office TVA): si l'assujetti ne remet pas ses décomptes, l'AFC estime la TVA due. Recours possible dans les 30 jours. " +
      "Art. 80: prescription: 5 ans pour la créance TVA ordinaire, 10 ans en cas de fraude fiscale.",
    law: "OLTVA",
    rs: "641.201",
    article: "76-80",
    title: "Décompte annuel TDFN, groupes TVA, décompte final radiation, estimation AFC, prescription",
    topic: ["oltva", "decompte_annuel", "tdfn", "groupe_tva", "prescription"],
    jurisdiction: "federal",
    effective_from: "2024-01-01",
  },

  // Art. 86-95 : Obligations formelles, factures
  {
    text: "[OLTVA Art. 86-89] Obligations formelles — tenue de la comptabilité et factures TVA. " +
      "Art. 86 OLTVA: obligation de tenir une comptabilité permettant de déterminer la TVA due et l'IP déductible (Art. 70 LTVA). Durée de conservation: 10 ans minimum. " +
      "Art. 87: factures — contenu obligatoire (Art. 26 LTVA): " +
      "(1) Nom/adresse + numéro TVA du fournisseur (format CHE-xxx.xxx.xxx MWST); " +
      "(2) Nom/adresse du destinataire; " +
      "(3) Date de facturation et nature de la prestation; " +
      "(4) Montant HT, taux TVA applicable, montant TVA; " +
      "(5) Si plusieurs taux: ventilation par taux. " +
      "Art. 88: factures électroniques: admises si authenticité et intégrité garanties (signature électronique qualifiée ou accord entre parties). " +
      "Art. 89: documents équivalents à une facture: bons de livraison, relevés d'acomptes, notes d'honoraires — doivent comporter les mêmes éléments que la facture.",
    law: "OLTVA",
    rs: "641.201",
    article: "86-89",
    title: "Obligations formelles TVA — comptabilité 10 ans, facture conforme CHE-MWST, factures électroniques",
    topic: ["oltva", "facture_tva", "obligations_formelles", "comptabilite", "conservation"],
    jurisdiction: "federal",
    effective_from: "2024-01-01",
  },
  {
    text: "[OLTVA Art. 90-95] Correction, rappel et infractions TVA. " +
      "Art. 90 OLTVA: droit de correction spontanée — l'assujetti peut corriger des erreurs des décomptes précédents dans le décompte courant (correction spontanée non punissable si avant contrôle AFC). " +
      "Art. 91: contrôle AFC (Art. 78 LTVA): l'AFC peut contrôler les livres et pièces justificatives dans les 5 ans. Délai porté à 10 ans si indices de soustraction. " +
      "Art. 92: notification complémentaire: si le contrôle révèle TVA sous-déclarée, notification + intérêts moratoires. Amende pour soustraction intentionnelle: jusqu'à 4× l'impôt soustrait. " +
      "Art. 93: utilisation abusive de la procédure de remboursement (fraude carrousel TVA): infraction pénale, poursuivi par le Ministère public fédéral. " +
      "Art. 94-95: obligations d'information et de collaboration du contribuable lors des contrôles AFC: accès illimité aux locaux et systèmes comptables, fourniture de documents dans les délais fixés.",
    law: "OLTVA",
    rs: "641.201",
    article: "90-95",
    title: "Correction spontanée TVA, contrôle AFC 5/10 ans, infractions, fraude carrousel TVA",
    topic: ["oltva", "correction_tva", "controle_afc", "infractions", "fraude_tva"],
    jurisdiction: "federal",
    effective_from: "2024-01-01",
  },
];

// ---------------------------------------------------------------------------
// All chunks
// ---------------------------------------------------------------------------

const ALL_CHUNKS: LawChunk[] = [...OIFD_CHUNKS, ...OLTVA_CHUNKS];

const LAWS_TO_CLEAN = ["OIFD", "OLTVA"];

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
    console.log(`[oifd-oltva] Supprimé: ${law}`);
  } catch (err) {
    console.warn(`[oifd-oltva] Delete ${law} skipped:`, (err as Error).message);
  }
}

async function countPoints(): Promise<number> {
  const { data } = await axios.get<{ result: { points_count: number } }>(
    `${QDRANT_URL}/collections/${COLLECTION}`,
  );
  return data.result.points_count;
}

async function upsertPoints(chunks: LawChunk[], vectors: number[][]): Promise<void> {
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
  console.log(`[oifd-oltva] QDRANT   : ${QDRANT_URL}`);
  console.log(`[oifd-oltva] EMBEDDER : ${EMBEDDER_URL}`);
  console.log(`[oifd-oltva] COLLECTION: ${COLLECTION}`);
  console.log(`[oifd-oltva] Chunks à ingérer: ${ALL_CHUNKS.length}`);
  console.log(`[oifd-oltva] Distribution:`);
  console.log(`  - OIFD (RS 642.116): ${OIFD_CHUNKS.length} chunks`);
  console.log(`  - OLTVA (RS 641.201): ${OLTVA_CHUNKS.length} chunks`);

  // 1. Embed
  const texts = ALL_CHUNKS.map((c) => c.text);
  console.log("\n[oifd-oltva] Embedding via BGE-M3...");
  const t0 = Date.now();

  const { data: embedResponse } = await axios.post<{
    data: Array<{ index: number; embedding: number[] }>;
  }>(`${EMBEDDER_URL}/v1/embeddings`, { input: texts });

  const vectors = embedResponse.data
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((item) => item.embedding);

  console.log(`[oifd-oltva] ${vectors.length} vecteurs produits en ${Date.now() - t0}ms (dim=${vectors[0]?.length ?? "?"})`);

  // 2. Clean existing
  const before = await countPoints();
  console.log(`\n[oifd-oltva] Points avant: ${before}`);
  for (const law of LAWS_TO_CLEAN) {
    await deleteByLaw(law);
  }

  // 3. Upsert
  await upsertPoints(ALL_CHUNKS, vectors);
  const after = await countPoints();
  console.log(`[oifd-oltva] Points après: ${after} (+${after - before})`);

  // 4. Smoke test
  console.log("\n[oifd-oltva] === Smoke test RAG ===");
  const testQueries = [
    "frais professionnels déductibles salariés forfait",
    "TVA taux normal 8.1% base de calcul",
    "amortissement dégressif taux AFC Notice A",
    "impôt préalable déduction usage mixte",
    "bénéfice imposable personne morale corrections fiscales",
    "assujettissement TVA seuil CHF 100000",
  ];

  for (const q of testQueries) {
    const { data: qEmbed } = await axios.post<{
      data: Array<{ index: number; embedding: number[] }>;
    }>(`${EMBEDDER_URL}/v1/embeddings`, { input: [q] });
    const qVec = qEmbed.data[0]?.embedding ?? [];

    const { data: searchRes } = await axios.post<{
      result: Array<{ id: string; score: number; payload: LawChunk }>;
    }>(`${QDRANT_URL}/collections/${COLLECTION}/points/search`, {
      vector: qVec,
      limit: 3,
      with_payload: true,
    });

    console.log(`\n  Q: "${q}"`);
    for (const hit of searchRes.result) {
      const isNew = LAWS_TO_CLEAN.includes(hit.payload.law);
      const mark = isNew ? "[OIFD/OLTVA]" : "            ";
      console.log(`    ${mark} [${hit.score.toFixed(3)}] ${hit.payload.law} Art.${hit.payload.article} — ${hit.payload.title.slice(0, 65)}`);
    }
  }

  console.log("\n[oifd-oltva] DONE ✓");
}

main().catch((err: unknown) => {
  console.error("[oifd-oltva] FATAL:", err);
  process.exit(1);
});
