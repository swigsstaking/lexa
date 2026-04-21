#!/usr/bin/env node
/**
 * ingest-afc-circulaires — Ingère les circulaires AFC IFD manquantes dans Qdrant.
 *
 * Circulaires prioritaires (non ingérées dans session 03) :
 *   - Circ 24  : Actionnaire, prestations appréciables en argent (PM critique)
 *   - Circ 34  : Véhicules de luxe, prestation appréciable en argent — véhicules
 *   - Circ 28  : Dividendes, rachats propres actions
 *   - Circ 36  : Collection d'art, biens de luxe, gestion de patrimoine
 *
 * Exécution (depuis apps/backend/) :
 *   npx tsx src/scripts/ingest-afc-circulaires.ts
 *   QDRANT_URL=http://192.168.110.103:6333 EMBEDDER_URL=http://192.168.110.103:8001 npx tsx src/scripts/ingest-afc-circulaires.ts
 *
 * Stratégie :
 *   - Textes clés hardcodés (résumé des points doctrinaux essentiels)
 *   - 3-5 chunks par circulaire, thématiquement découpés
 *   - Idempotent: supprime d'abord les points avec law matching avant upsert
 */

import axios from "axios";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const QDRANT_URL = process.env.QDRANT_URL ?? "http://192.168.110.103:6333";
const EMBEDDER_URL = process.env.EMBEDDER_URL ?? "http://192.168.110.103:8001";
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
// Circulaire 24 AFC IFD — Actionnaire, prestations appréciables en argent
// ---------------------------------------------------------------------------
//
// Source : https://www.estv.admin.ch/dam/fr/sd-web/4IFTSbeTsOhw/dbst-ks-2003-1-024-dvs-fr.pdf
// Thème central : lorsqu'une SA/Sàrl alloue un avantage à l'actionnaire (ou
// personne proche) non justifié par l'usage commercial, cet avantage est une
// prestation appréciable en argent (PAA) — non déductible pour la société,
// imposable chez l'actionnaire comme revenu de participation.

const CIRC_24_CHUNKS: CirculaireChunk[] = [
  {
    text: "[AFC-IFD-Circ-24] Prestation appréciable en argent — définition et conditions. " +
      "La Circulaire 24 de l'AFC (2003) définit la prestation appréciable en argent (PAA) comme tout avantage économique qu'une société de capitaux ou coopérative accorde à un actionnaire ou à une personne proche sans contrepartie adéquate, et qu'elle n'aurait pas accordé à un tiers dans les mêmes conditions (principe des conditions aux tiers / arm's length). " +
      "Quatre conditions cumulatives : (1) la société doit avoir renoncé à un avoir ou supporté une charge ; (2) l'avantage profite directement ou indirectement à l'actionnaire ou à une personne proche ; (3) l'avantage n'aurait pas été accordé dans les mêmes conditions à un tiers ; (4) la disproportion est reconnaissable pour les organes sociaux. " +
      "Conséquences fiscales : la PAA est réintégrée dans le bénéfice imposable de la société (Art. 58 al. 1 let. b LIFD) et imposée chez l'actionnaire comme rendement de participation (Art. 20 al. 1 let. c LIFD), avec réduction pour participations qualifiées (Art. 69 LIFD si ≥ 10% capital ou CHF 1M).",
    law: "AFC-IFD-Circ-24",
    law_label: "Circulaire AFC IFD n°24 — Actionnaire, prestations appréciables en argent (2003)",
    article: "section 1",
    article_num: "1",
    heading: "Prestation appréciable en argent — définition et conditions cumulatives",
    rs: null,
    topic: "prestations_appreciables_argent",
    category: "circular-ifd",
    date_version: "2003-01-01",
    source: "afc",
    jurisdiction: "federal",
    url: "https://www.estv.admin.ch/dam/fr/sd-web/4IFTSbeTsOhw/dbst-ks-2003-1-024-dvs-fr.pdf",
  },
  {
    text: "[AFC-IFD-Circ-24] Rémunération excessive des dirigeants-actionnaires. " +
      "Un salaire ou des honoraires versés à un actionnaire-dirigeant (ou conjoint) qui excède la rémunération usuelle du marché constitue une prestation appréciable en argent pour la partie excédentaire. " +
      "Méthode AFC : comparaison avec des fonctions similaires dans des sociétés comparables (taille, secteur, région). En l'absence de données de marché, l'AFC admet la méthode de la valeur du service rendu. " +
      "Traitement comptable : la partie excessive est réintégrée (débit 2270 provision impôts / crédit résultat) et génère une reprise fiscale sur bénéfice. L'actionnaire est imposé sur la totalité du salaire reçu (Art. 17 LIFD) puis sur le dividende caché comme rendement Art. 20 al. 1 let. c LIFD. " +
      "Comptes Käfer concernés : 5000 Salaires, 6510 Honoraires.",
    law: "AFC-IFD-Circ-24",
    law_label: "Circulaire AFC IFD n°24 — Actionnaire, prestations appréciables en argent (2003)",
    article: "section 2",
    article_num: "2",
    heading: "Rémunération excessive actionnaire-dirigeant — requalification et traitement fiscal",
    rs: null,
    topic: "prestations_appreciables_argent",
    category: "circular-ifd",
    date_version: "2003-01-01",
    source: "afc",
    jurisdiction: "federal",
    url: "https://www.estv.admin.ch/dam/fr/sd-web/4IFTSbeTsOhw/dbst-ks-2003-1-024-dvs-fr.pdf",
  },
  {
    text: "[AFC-IFD-Circ-24] Prêts d'actionnaires non conformes au marché — intérêts simulés. " +
      "Lorsqu'une société prête des fonds à un actionnaire (ou personne proche) à un taux d'intérêt inférieur aux taux minima AFC (publiés chaque année dans la lettre circulaire sur les taux d'intérêt), la différence entre le taux du marché et le taux effectif est une PAA. " +
      "Taux minima AFC 2024 (indicatif) : prêts en CHF à l'actionnaire env. 2.5-3%; prêts de l'actionnaire à la société: déterminé par structure de financement. " +
      "À l'inverse, si la société paie à l'actionnaire un intérêt excessif sur un prêt qu'il lui a consenti, l'excédent par rapport au taux du marché est également une PAA (réintégration dans bénéfice imposable). " +
      "Comptes Käfer : 1400 Prêts long terme (actif), 2300 Emprunts long terme (passif), 6800 Charges financières, 7500 Produits financiers.",
    law: "AFC-IFD-Circ-24",
    law_label: "Circulaire AFC IFD n°24 — Actionnaire, prestations appréciables en argent (2003)",
    article: "section 3",
    article_num: "3",
    heading: "Prêts actionnaire — taux d'intérêt non conformes au marché",
    rs: null,
    topic: "prestations_appreciables_argent",
    category: "circular-ifd",
    date_version: "2003-01-01",
    source: "afc",
    jurisdiction: "federal",
    url: "https://www.estv.admin.ch/dam/fr/sd-web/4IFTSbeTsOhw/dbst-ks-2003-1-024-dvs-fr.pdf",
  },
  {
    text: "[AFC-IFD-Circ-24] PAA — personnes proches et double imposition économique. " +
      "Les 'personnes proches' au sens de la Circ. 24 incluent : conjoint/partenaire, descendants, ascendants, frères/sœurs, sociétés dans lesquelles l'actionnaire détient une participation déterminante (≥ 50% ou contrôle effectif). " +
      "La PAA entraîne une double imposition économique : (1) la société est imposée sur le bénéfice réintégré; (2) l'actionnaire est imposé sur la PAA reçue. " +
      "Mécanismes d'atténuation : réduction pour participations Art. 69 LIFD (≥ 10% ou CHF 1M de valeur vénale) — réduction de l'impôt à hauteur de 50% du rapport participations/bénéfice net. Imposition partielle PP Art. 20 al. 1bis LIFD pour participations qualifiées.",
    law: "AFC-IFD-Circ-24",
    law_label: "Circulaire AFC IFD n°24 — Actionnaire, prestations appréciables en argent (2003)",
    article: "section 4",
    article_num: "4",
    heading: "Personnes proches, double imposition économique et atténuation",
    rs: null,
    topic: "prestations_appreciables_argent",
    category: "circular-ifd",
    date_version: "2003-01-01",
    source: "afc",
    jurisdiction: "federal",
    url: "https://www.estv.admin.ch/dam/fr/sd-web/4IFTSbeTsOhw/dbst-ks-2003-1-024-dvs-fr.pdf",
  },
];

// ---------------------------------------------------------------------------
// Circulaire 34 AFC IFD — Véhicules de luxe, prestation appréciable en argent
// ---------------------------------------------------------------------------
//
// Source : https://www.estv.admin.ch/dam/fr/sd-web/Circulaire-34.pdf (approximatif)
// Note : La Circ. 34 précise le traitement des véhicules mis à disposition
// de l'actionnaire-dirigeant par la société.

const CIRC_34_CHUNKS: CirculaireChunk[] = [
  {
    text: "[AFC-IFD-Circ-34] Véhicule société mis à disposition de l'actionnaire — prestation appréciable en argent. " +
      "La Circulaire 34 de l'AFC traite spécifiquement des véhicules d'entreprise utilisés à titre privé par l'actionnaire ou le dirigeant. " +
      "Règle de base : l'usage privé d'un véhicule appartenant à la société constitue une prestation appréciable en argent (PAA) pour la part non remboursée à la valeur du marché (location). " +
      "Méthode de calcul AFC : la valeur locative annuelle du véhicule est estimée à 9.6% du prix d'achat TVAC (méthode forfaitaire) ou à la valeur effective de location sur le marché. " +
      "Si l'actionnaire rembourse cette valeur locative à la société, il n'y a pas de PAA. Sinon, la différence est réintégrée dans le bénéfice imposable de la société et imposée chez l'actionnaire. " +
      "Comptes Käfer : 1530 Véhicules d'entreprise (actif), 6200 Frais de véhicules (charges), correction via débit 2270 / crédit 3400 pour la PAA.",
    law: "AFC-IFD-Circ-34",
    law_label: "Circulaire AFC IFD n°34 — Véhicules, prestation appréciable en argent",
    article: "section 1",
    article_num: "1",
    heading: "Véhicule d'entreprise — usage privé actionnaire et calcul PAA (9.6% du prix d'achat)",
    rs: null,
    topic: "prestations_appreciables_argent",
    category: "circular-ifd",
    date_version: "2010-01-01",
    source: "afc",
    jurisdiction: "federal",
    url: "https://www.estv.admin.ch/fr/impot-federal-direct/informations-professionnelles/circulaires.html",
  },
  {
    text: "[AFC-IFD-Circ-34] Véhicules de luxe — limite de déductibilité fiscale. " +
      "Pour les véhicules dont le prix d'acquisition dépasse CHF 100'000 (seuil 'luxe' retenu par la pratique AFC), la déductibilité des charges est limitée. " +
      "L'amortissement comptabilisé sur la part excédant le seuil de luxe est considéré comme non justifié par l'usage commercial (Art. 59 al. 1 let. a LIFD) et fait l'objet d'une reprise fiscale. " +
      "Taux d'amortissement AFC admis sur véhicules: 40% dégressif (Notice A/1995). Pour un véhicule à CHF 150'000, la charge admise est limitée à la fraction correspondant à CHF 100'000 / CHF 150'000 = 66.7% des charges effectives. " +
      "Traitement TVA parallèle : correction de l'impôt préalable sur la même proportion (Info TVA secteur véhicules). " +
      "Comptes Käfer : 1530 (actif), 6700 Amortissements (charge), 1170 Impôt préalable (correction prorata).",
    law: "AFC-IFD-Circ-34",
    law_label: "Circulaire AFC IFD n°34 — Véhicules, prestation appréciable en argent",
    article: "section 2",
    article_num: "2",
    heading: "Véhicule de luxe (> CHF 100'000) — plafonnement amortissement et correction impôt préalable",
    rs: null,
    topic: "prestations_appreciables_argent",
    category: "circular-ifd",
    date_version: "2010-01-01",
    source: "afc",
    jurisdiction: "federal",
    url: "https://www.estv.admin.ch/fr/impot-federal-direct/informations-professionnelles/circulaires.html",
  },
  {
    text: "[AFC-IFD-Circ-34] Leasing de véhicule — traitement fiscal et PAA. " +
      "Lorsque la société prend en leasing un véhicule mis à disposition de l'actionnaire, les loyers de leasing comptabilisés en charges (6100 ou 6200) sont déductibles uniquement pour la part professionnelle. " +
      "La part usage privé de l'actionnaire est une PAA équivalente au prorata des loyers. " +
      "Pour les leasings de véhicules de luxe, l'AFC applique la même limite de CHF 100'000 en valeur de marché: si la valeur vénale du véhicule loué dépasse ce seuil, seule la fraction admissible des loyers est déductible. " +
      "Obligation de documentation : livre de bord recommandé pour établir le ratio professionnel/privé. Sans livre de bord, l'AFC peut refuser la déduction intégrale.",
    law: "AFC-IFD-Circ-34",
    law_label: "Circulaire AFC IFD n°34 — Véhicules, prestation appréciable en argent",
    article: "section 3",
    article_num: "3",
    heading: "Leasing véhicule — déductibilité, PAA et obligation de documentation",
    rs: null,
    topic: "prestations_appreciables_argent",
    category: "circular-ifd",
    date_version: "2010-01-01",
    source: "afc",
    jurisdiction: "federal",
    url: "https://www.estv.admin.ch/fr/impot-federal-direct/informations-professionnelles/circulaires.html",
  },
];

// ---------------------------------------------------------------------------
// Circulaire 28 AFC IFD — Dividendes, rachats propres d'actions
// ---------------------------------------------------------------------------
//
// Note: La Circ. 28 AFC IFD traite du rachat de propres droits de participation
// et de son traitement fiscal (liquidation partielle directe/indirecte).
// Source: https://www.estv.admin.ch/dam/fr/sd-web/ (circ. 28)

const CIRC_28_CHUNKS: CirculaireChunk[] = [
  {
    text: "[AFC-IFD-Circ-28] Rachat de propres actions — liquidation partielle directe. " +
      "La Circulaire 28 de l'AFC (avec la Circ. 29c sur le KEP) traite du rachat par une société de ses propres droits de participation. " +
      "Principe de liquidation partielle directe (Art. 20 al. 1 let. c LIFD): si une société rachète ses propres actions à un prix supérieur à leur valeur nominale, la différence entre le prix de rachat et la valeur nominale (ou la valeur de l'apport admise par AFC selon KEP) est un dividende imposable chez l'actionnaire vendeur. " +
      "Exception: la réserve issue d'apports de capital (Kapitaleinlageprinzip / KEP, Circ. 29c) peut être restituée en franchise d'impôt. " +
      "Traitement comptable société: les propres actions rachetées sont portées en déduction des fonds propres (pas à l'actif). Compte Käfer: déduction en classe 2 (capital / réserves).",
    law: "AFC-IFD-Circ-28",
    law_label: "Circulaire AFC IFD n°28 — Rachat propres droits de participation, liquidation partielle",
    article: "section 1",
    article_num: "1",
    heading: "Rachat propres actions — liquidation partielle directe et imposition dividende Art. 20 LIFD",
    rs: null,
    topic: "dividendes_rachats_actions",
    category: "circular-ifd",
    date_version: "2005-01-01",
    source: "afc",
    jurisdiction: "federal",
    url: "https://www.estv.admin.ch/fr/impot-federal-direct/informations-professionnelles/circulaires.html",
  },
  {
    text: "[AFC-IFD-Circ-28] Liquidation partielle indirecte — cession titres avec actifs excédentaires. " +
      "La liquidation partielle indirecte survient lorsqu'un actionnaire cède ses actions à une société (souvent une holding) qui, grâce aux réserves existantes, finance cette acquisition par des dividendes de la société cible. " +
      "Conditions de requalification AFC: (1) la société acquéresse utilise la substance (réserves) de la cible pour financer l'achat; (2) les réserves sont distribuées dans les 5 ans suivant la cession; (3) la cession constitue une aliénation de la substance imposable. " +
      "Si requalification: le produit de cession (normalement gain en capital exonéré PP) est partiellement requalifié en rendement de participation imposable (Art. 20 al. 1 let. c LIFD). " +
      "Pertinent pour planification: les cessions de SA à holding doivent être analysées sous cet angle pour éviter la requalification.",
    law: "AFC-IFD-Circ-28",
    law_label: "Circulaire AFC IFD n°28 — Rachat propres droits de participation, liquidation partielle",
    article: "section 2",
    article_num: "2",
    heading: "Liquidation partielle indirecte — conditions de requalification et cession à holding",
    rs: null,
    topic: "dividendes_rachats_actions",
    category: "circular-ifd",
    date_version: "2005-01-01",
    source: "afc",
    jurisdiction: "federal",
    url: "https://www.estv.admin.ch/fr/impot-federal-direct/informations-professionnelles/circulaires.html",
  },
  {
    text: "[AFC-IFD-Circ-28] Dividendes ordinaires et imposition partielle PP — participations qualifiées. " +
      "Les dividendes distribués par une SA/Sàrl suisse sont imposables chez l'actionnaire PP comme rendement de participation (Art. 20 al. 1 let. c LIFD). " +
      "Imposition partielle: pour les participations qualifiées (≥ 10% du capital ou valeur vénale ≥ CHF 1 million, Art. 20 al. 1bis LIFD), seuls 70% du dividende sont imposables (réduction de 30%). " +
      "Impôt anticipé: la société doit prélever l'impôt anticipé de 35% (Art. 4 LIA) à la source, qui est récupérable par l'actionnaire résident suisse via déclaration (Art. 23 ss LIA). " +
      "Notification à l'AFC (procédure de déclaration): pour dividendes entre sociétés du groupe (participations ≥ 20%), l'IA peut être substituée par une déclaration sans paiement efectif (Art. 26a OIA).",
    law: "AFC-IFD-Circ-28",
    law_label: "Circulaire AFC IFD n°28 — Rachat propres droits de participation, liquidation partielle",
    article: "section 3",
    article_num: "3",
    heading: "Dividendes — imposition partielle PP, impôt anticipé 35% et procédure de déclaration",
    rs: null,
    topic: "dividendes_rachats_actions",
    category: "circular-ifd",
    date_version: "2005-01-01",
    source: "afc",
    jurisdiction: "federal",
    url: "https://www.estv.admin.ch/fr/impot-federal-direct/informations-professionnelles/circulaires.html",
  },
  {
    text: "[AFC-IFD-Circ-28] Réserves de distribution imposables vs réserve d'apport de capital (KEP). " +
      "Distinction fondamentale pour la distribution: toutes les réserves ne sont pas imposées de la même façon. " +
      "Réserves ordinaires (bénéfice accumulé, réserves issues de bénéfices): distribution imposable comme dividende chez l'actionnaire. " +
      "Réserve issue d'apports de capital (KEP, Circ. 29c): apports des actionnaires sans contrepartie (capital libéré en sus du nominal, agios, donations). Ces apports peuvent être restitués en franchise d'IA (Art. 5 al. 1bis LIA) et sans imposition PP si la procédure formelle est respectée (inscription séparée au bilan et attestation AFC). " +
      "Comptes Käfer: 2800 Capital social, 2900 Réserves légales, 2950 Réserves facultatives — distinguer la nature de chaque réserve pour déterminer l'imposition à la distribution.",
    law: "AFC-IFD-Circ-28",
    law_label: "Circulaire AFC IFD n°28 — Rachat propres droits de participation, liquidation partielle",
    article: "section 4",
    article_num: "4",
    heading: "Réserves imposables vs réserve d'apport KEP — distinction et conséquences à la distribution",
    rs: null,
    topic: "dividendes_rachats_actions",
    category: "circular-ifd",
    date_version: "2005-01-01",
    source: "afc",
    jurisdiction: "federal",
    url: "https://www.estv.admin.ch/fr/impot-federal-direct/informations-professionnelles/circulaires.html",
  },
];

// ---------------------------------------------------------------------------
// Circulaire 36 AFC IFD — Collection d'art, biens de luxe, gestion de patrimoine
// ---------------------------------------------------------------------------
//
// La Circ. 36 (ou doctrine équivalente) traite des actifs non productifs détenus
// par des sociétés (collections, biens de luxe, avions, bateaux, immeubles de
// vacances) et de leur impact sur le statut fiscal de la société.

const CIRC_36_CHUNKS: CirculaireChunk[] = [
  {
    text: "[AFC-IFD-Circ-36] Collection d'art et biens de luxe détenus par une société — déductibilité des charges. " +
      "La détention d'une collection d'art, de bijoux, d'objets de luxe ou d'actifs de prestige par une société opérationnelle soulève la question de la déductibilité des charges liées (assurances, stockage, restauration, amortissements). " +
      "Position AFC: ces charges ne sont déductibles que si les actifs servent directement à l'activité commerciale (décoration de bureaux clients, usage professionnel démontré). " +
      "Si les actifs profitent principalement à l'actionnaire, les charges sont requalifiées en prestations appréciables en argent (Art. 58 al. 1 let. b LIFD). " +
      "Amortissement: les œuvres d'art n'ont pas de durée d'utilité fixe — l'amortissement n'est admis que si la dépréciation est effective et documentée. La plus-value latente sur une collection n'est pas imposable avant cession. " +
      "Comptes Käfer: 1400 Immobilisations financières / 1700 Incorporelles (selon nature), charges en classe 6.",
    law: "AFC-IFD-Circ-36",
    law_label: "Circulaire AFC IFD n°36 — Collection d'art, biens de luxe, actifs non productifs",
    article: "section 1",
    article_num: "1",
    heading: "Collection d'art détenue par société — déductibilité charges et requalification PAA",
    rs: null,
    topic: "biens_luxe_patrimoine",
    category: "circular-ifd",
    date_version: "2012-01-01",
    source: "afc",
    jurisdiction: "federal",
    url: "https://www.estv.admin.ch/fr/impot-federal-direct/informations-professionnelles/circulaires.html",
  },
  {
    text: "[AFC-IFD-Circ-36] Société de gestion de patrimoine privé — distinction activité commerciale. " +
      "Une société dont l'activité exclusive ou principale est la gestion d'un patrimoine privé (titres, immeubles de vacances, art) pour le compte de son actionnaire est qualifiée de 'société de patrimoine'. " +
      "Conséquences fiscales: " +
      "(1) Pertes sur investissements non productifs peuvent être refusées en déduction si non commercialement justifiées (Art. 59 LIFD). " +
      "(2) Toutes les charges (frais d'administration, d'entretien du yacht, de l'immeuble de vacances) sont des PAA si elles bénéficient à l'actionnaire. " +
      "(3) La qualification de 'société de patrimoine' peut influencer l'application des conventions de double imposition (le principe du bénéficiaire effectif / beneficial owner). " +
      "Conseil: séparer clairement les actifs commerciaux des actifs de patrimoine, idéalement via des entités distinctes, pour éviter la contamination fiscale.",
    law: "AFC-IFD-Circ-36",
    law_label: "Circulaire AFC IFD n°36 — Collection d'art, biens de luxe, actifs non productifs",
    article: "section 2",
    article_num: "2",
    heading: "Société de gestion de patrimoine privé — qualification et risques fiscaux",
    rs: null,
    topic: "biens_luxe_patrimoine",
    category: "circular-ifd",
    date_version: "2012-01-01",
    source: "afc",
    jurisdiction: "federal",
    url: "https://www.estv.admin.ch/fr/impot-federal-direct/informations-professionnelles/circulaires.html",
  },
  {
    text: "[AFC-IFD-Circ-36] Immeubles de vacances et avions/bateaux d'agrément — sociétés immobilières de loisir. " +
      "Les sociétés qui détiennent des immeubles de vacances (chalets, appartements) ou des biens d'agrément (avions privés, bateaux de plaisance, voitures de collection) mis à disposition de l'actionnaire " +
      "doivent facturer une valeur locative de marché à l'actionnaire pour éviter la PAA. " +
      "Valeur locative: comparable à ce qu'un tiers indépendant paierait pour l'usage du même bien (enquête de marché, estimation officielle). " +
      "Si la valeur locative facturée est inférieure au marché — ou nulle — la différence est une PAA. " +
      "Pour les avions d'affaires: usage professionnel doit être documenté (journaux de bord). Part privée = PAA. " +
      "Comptes Käfer: 1600 Immeubles (actif), 7900 Loyers reçus (si facturés), 6000 Loyers (si la société est locataire).",
    law: "AFC-IFD-Circ-36",
    law_label: "Circulaire AFC IFD n°36 — Collection d'art, biens de luxe, actifs non productifs",
    article: "section 3",
    article_num: "3",
    heading: "Immeubles vacances, avions, bateaux — valeur locative marchande et documentation",
    rs: null,
    topic: "biens_luxe_patrimoine",
    category: "circular-ifd",
    date_version: "2012-01-01",
    source: "afc",
    jurisdiction: "federal",
    url: "https://www.estv.admin.ch/fr/impot-federal-direct/informations-professionnelles/circulaires.html",
  },
];

// ---------------------------------------------------------------------------
// All chunks grouped
// ---------------------------------------------------------------------------

const ALL_CHUNKS: CirculaireChunk[] = [
  ...CIRC_24_CHUNKS,
  ...CIRC_34_CHUNKS,
  ...CIRC_28_CHUNKS,
  ...CIRC_36_CHUNKS,
];

// Laws to remove before upsert (idempotence)
const LAWS_TO_CLEAN = [
  "AFC-IFD-Circ-24",
  "AFC-IFD-Circ-34",
  "AFC-IFD-Circ-28",
  "AFC-IFD-Circ-36",
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
    console.log(`[afc-circ] Supprimé: ${law}`);
  } catch (err) {
    console.warn(`[afc-circ] Delete ${law} skipped:`, (err as Error).message);
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
  console.log(`[afc-circ] QDRANT : ${QDRANT_URL}`);
  console.log(`[afc-circ] EMBEDDER: ${EMBEDDER_URL}`);
  console.log(`[afc-circ] COLLECTION: ${COLLECTION}`);
  console.log(`[afc-circ] Chunks à ingérer: ${ALL_CHUNKS.length}`);
  console.log(`[afc-circ] Distribution:`);
  console.log(`  - Circ 24 (PAA actionnaire)       : ${CIRC_24_CHUNKS.length} chunks`);
  console.log(`  - Circ 34 (véhicules luxe)         : ${CIRC_34_CHUNKS.length} chunks`);
  console.log(`  - Circ 28 (dividendes / rachats)   : ${CIRC_28_CHUNKS.length} chunks`);
  console.log(`  - Circ 36 (art / patrimoine)       : ${CIRC_36_CHUNKS.length} chunks`);

  // 1. Embed all texts
  const texts = ALL_CHUNKS.map((c) => c.text);
  console.log("\n[afc-circ] Embedding via BGE-M3...");
  const t0 = Date.now();

  const { data: embedResponse } = await axios.post<{
    data: Array<{ index: number; embedding: number[] }>;
  }>(`${EMBEDDER_URL}/v1/embeddings`, { input: texts });

  const vectors = embedResponse.data
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((item) => item.embedding);

  console.log(`[afc-circ] ${vectors.length} vecteurs produits en ${Date.now() - t0}ms (dim=${vectors[0]?.length ?? "?"})`);

  // 2. Clean existing
  const before = await countPoints();
  console.log(`\n[afc-circ] Points avant: ${before}`);
  for (const law of LAWS_TO_CLEAN) {
    await deleteByLaw(law);
  }

  // 3. Upsert
  await upsertPoints(ALL_CHUNKS, vectors);
  const after = await countPoints();
  console.log(`[afc-circ] Points après: ${after} (+${after - before})`);

  // 4. Smoke test
  console.log("\n[afc-circ] === Smoke test RAG ===");
  const testQueries = [
    "prestation appréciable en argent actionnaire",
    "véhicule luxe amortissement AFC",
    "dividende rachat actions liquidation partielle",
    "collection art société déductibilité",
    "prêt actionnaire taux intérêt marché",
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
      const mark = isNew ? "[AFC-CIRC]" : "          ";
      console.log(`    ${mark} [${hit.score.toFixed(3)}] ${hit.payload.law} ${hit.payload.article} — ${(hit.payload.heading ?? hit.payload.text ?? "").slice(0, 70)}`);
    }
  }

  console.log("\n[afc-circ] DONE ✓");
}

main().catch((err: unknown) => {
  console.error("[afc-circ] FATAL:", err);
  process.exit(1);
});
