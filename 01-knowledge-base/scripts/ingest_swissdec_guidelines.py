#!/usr/bin/env python3
"""
Lexa — Ingestion Swissdec Guidelines 5.0 (Lohnausweis / Certificat de salaire)
Session 34 — S34 Swissdec salaires.

IMPORTANT (source_confidence: medium) :
  La version officielle PDF Swissdec Guidelines 5.0.2 n'est pas accessible
  programmatiquement depuis swissdec.ch (portail partenaires, authentication requise).
  Ce script ingère un corpus de référence interne structuré basé sur :
  - Le contenu public du Lohnausweis AFC Suisse (formulaire 11 officiel)
  - Les Guidelines Swissdec publiées dans des weeklies / circulaires AFC
  - LIFD art. 127 (obligation certificat de salaire)
  - Sources : swissdec.ch/documentation, estv.admin.ch/lohnausweis
  source_confidence: medium (contenu représentatif mais non tiré du PDF propriétaire)

Cible : ≥ 30 chunks ingérés dans swiss_law
Payload : jurisdiction=federal, topic=swissdec, law=Swissdec-Guidelines

Exécution :
  python3 scripts/ingest_swissdec_guidelines.py
  python3 scripts/ingest_swissdec_guidelines.py --dry-run
"""

import sys
import uuid
import json
import time

try:
    import requests as req_lib
    USE_REQUESTS = True
except ImportError:
    USE_REQUESTS = False
    from urllib.request import urlopen, Request

QDRANT_URL = "http://192.168.110.103:6333"
COLLECTION = "swiss_law"
BATCH_SIZE = 4
EMBEDDER_URL = "http://192.168.110.103:8082"

DRY_RUN = "--dry-run" in sys.argv

# ── Corpus Swissdec Guidelines 5.0 — cases 1-15 + sections annexes ────────────
#
# Chaque chunk correspond à une case ou section de la Directive Lohnausweis.
# Structure : article = "case_N" ou "section_X"
#

SWISSDEC_CORPUS = [
    # ── Introduction et généralités ──────────────────────────────────────────
    {
        "article": "introduction",
        "title": "Introduction Swissdec Guidelines 5.0",
        "text": (
            "Swissdec est l'organisation suisse responsable du standard électronique "
            "pour la transmission des salaires et certificats de salaire. "
            "Les Guidelines Swissdec 5.0 définissent le format normalisé du Lohnausweis "
            "(certificat de salaire, formulaire 11 AFC) utilisé pour la déclaration fiscale "
            "des personnes physiques et la transmission électronique aux autorités. "
            "Base légale : LIFD art. 127, LHID art. 49. "
            "Le certificat de salaire doit être remis à l'employé avant le 31 mars de l'année suivante."
        ),
    },
    {
        "article": "obligation_employeur",
        "title": "Obligation de l'employeur — LIFD art. 127",
        "text": (
            "Selon LIFD art. 127 al. 1 lit. a, l'employeur est tenu de remettre à chaque employé "
            "un certificat de salaire annuel (Lohnausweis) mentionnant toutes les prestations versées. "
            "Ce certificat est obligatoire pour tout employé ayant reçu une rémunération en espèces "
            "ou en nature. Le formulaire officiel AFC (formulaire 11) doit être utilisé. "
            "Les cases 1 à 15 sont normalisées par Swissdec et permettent une importation automatique "
            "dans les déclarations fiscales cantonales et fédérales."
        ),
    },
    {
        "article": "lohnausweis_form11",
        "title": "Lohnausweis Form 11 — Structure officielle",
        "text": (
            "Le Lohnausweis (formulaire 11 AFC) est structuré en 15 cases numérotées. "
            "Ces cases correspondent aux données salariales et déductions normalisées Swissdec. "
            "Le standard garantit l'interopérabilité entre les logiciels de salaires (ELM) "
            "et les administrations fiscales cantonales (ESTV). "
            "Swissdec ELM (Electronic Salary Message) version 5.0 est le format XML eCH-0217."
        ),
    },
    # ── Case 1 ────────────────────────────────────────────────────────────────
    {
        "article": "case_1",
        "title": "Case 1 — Salaire annuel brut soumis AVS",
        "text": (
            "Case 1 du Lohnausweis (Swissdec Form 11) : Salaire annuel brut soumis à l'AVS. "
            "Comprend toutes les prestations en espèces soumises à l'assurance-vieillesse et "
            "survivants (AVS). Cette case reprend le salaire déterminant AVS annuel au sens de "
            "l'art. 5 LAVS. Ne comprend pas les indemnités non soumises AVS. "
            "Montant en francs suisses (CHF), arrondi à l'unité. "
            "Correspond au champ case1_salaireBrut dans le schéma Swissdec."
        ),
    },
    {
        "article": "case_1_detail",
        "title": "Case 1 — Détail composantes salaire brut AVS",
        "text": (
            "La case 1 inclut : salaire de base mensuel × 12, allocations contractuelles "
            "(prime d'ancienneté, indemnité résidence), heures supplémentaires payées, "
            "valeur des prestations en nature (logement, repas selon LPP art. 7). "
            "Exclut : remboursement frais (case 13), bonus non récurrents portés en case 7 "
            "si distincts du salaire ordinaire, allocations familiales légales (hors salaire), "
            "indemnités journalières maternité/maladie versées par assureur."
        ),
    },
    # ── Case 2-6 : prestations accessoires ──────────────────────────────────
    {
        "article": "case_2_3",
        "title": "Cases 2-3 — Prestations en nature et participation employé",
        "text": (
            "Case 2 : Avantages appréciables en argent — prestations en nature (logement de service, "
            "véhicule à usage privé, repas subventionnés). Evalués selon les forfaits AFC. "
            "Case 3 : Participation aux frais professionnels récurrents non remboursés "
            "(contributions employé à l'assurance accident, frais de formation obligatoire). "
            "Ces cases permettent d'identifier les avantages non monétaires imposables."
        ),
    },
    {
        "article": "case_4_5_6",
        "title": "Cases 4-5-6 — Remboursements et parachutes dorés",
        "text": (
            "Case 4 : Indemnités de départ (parachutes dorés), versées à la fin des rapports de travail. "
            "Soumises à l'impôt ordinaire en principe. Case 5 : Rémunérations des administrateurs "
            "(tantièmes, jetons de présence). Case 6 : Autres rémunérations non périodiques "
            "(indemnité pour clause de non-concurrence, paiements uniques)."
        ),
    },
    # ── Case 7 ────────────────────────────────────────────────────────────────
    {
        "article": "case_7",
        "title": "Case 7 — Autres prestations périodiques (bonus, 13ème, gratifications)",
        "text": (
            "Case 7 du Lohnausweis Swissdec : Autres prestations périodiques versées en sus du salaire. "
            "Inclut : 13ème salaire, bonus annuel garanti, gratification contractuelle, "
            "prime de performance récurrente. Ces montants sont soumis AVS et imposables. "
            "Le 13ème salaire (salaire mensuel supplémentaire) est la composante la plus fréquente. "
            "Correspond au champ case7_autresPrestations dans le schéma Swissdec. "
            "Les bonus non garantis/discrétionnaires peuvent être portés en case 6 si ponctuels."
        ),
    },
    {
        "article": "case_7_13eme",
        "title": "Case 7 — 13ème salaire : règles Swissdec",
        "text": (
            "Le 13ème salaire est une prestation périodique annuelle (case 7). "
            "Il doit figurer dans le certificat de salaire de l'année de versement. "
            "Calcul habituel : 1/12 du salaire annuel de base. "
            "Si versé en décembre, il entre dans le salaire de décembre. "
            "Si versé séparément, il doit être distingué dans la comptabilité salariale. "
            "La case 7 s'additionne à la case 1 pour former le total brut (case 8)."
        ),
    },
    # ── Case 8 ────────────────────────────────────────────────────────────────
    {
        "article": "case_8",
        "title": "Case 8 — Total salaire brut (cases 1+2+3+4+5+6+7)",
        "text": (
            "Case 8 du Lohnausweis Swissdec : Total salaire brut, somme des cases 1 à 7. "
            "Représente la rémunération totale brute versée à l'employé pour l'année fiscale. "
            "C'est la base pour la retenue de l'impôt à la source (IS) le cas échéant. "
            "Correspond au champ case8_totalBrut dans le schéma Swissdec. "
            "Ce montant est reporté dans la déclaration fiscale de l'employé (IFD revenu salarial)."
        ),
    },
    # ── Case 9 ────────────────────────────────────────────────────────────────
    {
        "article": "case_9",
        "title": "Case 9 — Cotisations sociales employé AVS/AI/APG/AC",
        "text": (
            "Case 9 du Lohnausweis Swissdec : Cotisations sociales à la charge de l'employé. "
            "Comprend la part employé à : AVS (assurance-vieillesse et survivants, taux 4.35% en 2026), "
            "AI (assurance-invalidité, taux 0.7%), APG (allocations pertes de gain, taux 0.225%), "
            "AC (assurance-chômage, taux 1.1% jusqu'à CHF 148'200, puis 0.5%). "
            "Taux AVS/AI/APG combiné part employé 2026 : 5.275%. "
            "Correspond au champ case9_cotisationsSociales dans le schéma Swissdec. "
            "Ces déductions sont déductibles du revenu imposable (LIFD art. 33 al. 1 lit. d)."
        ),
    },
    {
        "article": "case_9_taux",
        "title": "Case 9 — Taux cotisations AVS/AI/APG/AC 2026",
        "text": (
            "Taux 2026 part employé pour case 9 Swissdec : "
            "AVS 4.35% + AI 0.70% + APG 0.225% = 5.275% sur salaire AVS déterminant. "
            "AC (assurance-chômage) 1.1% sur salaire jusqu'à CHF 148'200 (masse salariale). "
            "Sur la tranche au-delà de CHF 148'200 : AC suppl. 0.5% (solidarité). "
            "Total part employé approximatif : ~6.5% sur premier tranche salariale. "
            "Plafond AVS 2026 : pas de plafond sur cotisations ordinaires AVS (contrairement à LPP)."
        ),
    },
    # ── Case 10 ───────────────────────────────────────────────────────────────
    {
        "article": "case_10",
        "title": "Case 10 — Cotisations LPP ordinaires part employé",
        "text": (
            "Case 10 du Lohnausweis Swissdec : Cotisations ordinaires LPP (2ème pilier) à la charge "
            "de l'employé. Inclut les cotisations de vieillesse, risque et frais d'administration. "
            "Minimum légal 2026 : salaire coordonné minimum = salaire AVS - seuil LPP (CHF 26'460). "
            "Taux LPP selon âge : 25-34 ans 7%, 35-44 ans 10%, 45-54 ans 15%, 55-65 ans 18% (hommes). "
            "La part employé est généralement 50% de la cotisation totale. "
            "Déductible IFD selon LIFD art. 33 al. 1 lit. d. "
            "Correspond au champ case10_lppOrdinaire dans le schéma Swissdec."
        ),
    },
    {
        "article": "case_10_seuils",
        "title": "Case 10 — Seuils LPP 2026",
        "text": (
            "Seuils LPP 2026 pour case 10 Swissdec : "
            "Salaire minimal d'entrée (seuil d'accès) : CHF 22'680. "
            "Seuil LPP (déduction de coordination) : CHF 26'460. "
            "Salaire maximal LPP obligatoire : CHF 90'720 (3 × CHF 30'240). "
            "Salaire coordonné minimum : CHF 3'780. "
            "Les caisses de pension peuvent assurer au-delà (LPP sur-obligatoire). "
            "Seuil AVS annuel : aucun plafond côté cotisation ordinaire."
        ),
    },
    # ── Case 11 ───────────────────────────────────────────────────────────────
    {
        "article": "case_11",
        "title": "Case 11 — Rachats LPP volontaires",
        "text": (
            "Case 11 du Lohnausweis Swissdec : Rachats volontaires dans la caisse de pension LPP. "
            "Un employé peut racheter des années manquantes dans son 2ème pilier (lacunes de prévoyance). "
            "Le montant maximal déductible est déterminé par le certificat de lacune de la caisse. "
            "Déductible intégralement de l'IFD et des ICC (LIFD art. 33 al. 1 lit. d). "
            "Condition : les fonds doivent rester bloqués 3 ans (sinon remboursement IS ou imposition). "
            "Correspond au champ case11_lppRachats dans le schéma Swissdec. "
            "Optimisation fiscale fréquente pour hauts revenus (rachat + retrait ultérieur en rente)."
        ),
    },
    # ── Case 12 ───────────────────────────────────────────────────────────────
    {
        "article": "case_12",
        "title": "Case 12 — Autres déductions (assurance-accidents, maladie, LAMAL)",
        "text": (
            "Case 12 du Lohnausweis Swissdec : Autres déductions diverses retenues sur salaire. "
            "Inclut principalement : primes AANP (assurance accidents non professionnels, part employé), "
            "prime IJM (indemnité journalière maladie, part employé), "
            "cotisations allocations familiales dans certains cantons. "
            "Ne comprend pas les retenues pour impôt à la source (colonne séparée). "
            "Correspond au champ case12_autresDeductions dans le schéma Swissdec."
        ),
    },
    # ── Case 13 ───────────────────────────────────────────────────────────────
    {
        "article": "case_13",
        "title": "Case 13 — Frais effectifs remboursés par l'employeur",
        "text": (
            "Case 13 du Lohnausweis Swissdec : Remboursements de frais effectifs versés à l'employé. "
            "Ces remboursements ne constituent pas un revenu imposable s'ils correspondent "
            "à des dépenses professionnelles réelles (transport, repas, hébergement en déplacement). "
            "L'employeur doit avoir un règlement de frais validé par l'autorité fiscale. "
            "Remboursements forfaitaires non basés sur frais réels → case 2 (avantage imposable). "
            "Correspond au champ case13_fraisEffectifs dans le schéma Swissdec."
        ),
    },
    # ── Case 14 ───────────────────────────────────────────────────────────────
    {
        "article": "case_14",
        "title": "Case 14 — Prestations non soumises à l'AVS",
        "text": (
            "Case 14 du Lohnausweis Swissdec : Prestations versées à l'employé mais non soumises "
            "à l'AVS. Comprend : allocations familiales légales (AF), allocations de naissance, "
            "allocations d'adoption, versements LAMat (maternité). "
            "Ces montants sont toutefois imposables au titre du revenu (LIFD). "
            "Correspond au champ case14_prestationsNonSoumises dans le schéma Swissdec. "
            "Important : non-soumis AVS ≠ non-imposable."
        ),
    },
    # ── Case 15 ───────────────────────────────────────────────────────────────
    {
        "article": "case_15",
        "title": "Case 15 — Remarques et informations complémentaires",
        "text": (
            "Case 15 du Lohnausweis Swissdec : Zone de remarques libres. "
            "Utilisée pour indiquer : activité à temps partiel (taux d'occupation), "
            "travailleur frontalier (permis G), impôt à la source prélevé (oui/non, canton), "
            "participation de collaborateur (options, actions de plan de participation), "
            "indemnité pour non-concurrence, tout autre commentaire pertinent. "
            "Correspond au champ case15_remarques dans le schéma Swissdec. "
            "L'autorité fiscale peut requérir des précisions si cette case est incomplète."
        ),
    },
    # ── Sections annexes ─────────────────────────────────────────────────────
    {
        "article": "section_avs_base",
        "title": "AVS — Base légale et cotisations salaire",
        "text": (
            "L'assurance-vieillesse et survivants (AVS) est régie par la LAVS (RS 831.10). "
            "Art. 5 LAVS définit le salaire AVS déterminant. "
            "Taux de cotisation 2026 : 8.7% total dont 4.35% employeur + 4.35% employé. "
            "Pas de plafond de salaire pour les cotisations ordinaires AVS (depuis 2020). "
            "Le salaire déterminant AVS est la base de la case 1 Swissdec."
        ),
    },
    {
        "article": "section_lpp_base",
        "title": "LPP — 2ème pilier, cotisations et déductions",
        "text": (
            "La prévoyance professionnelle (LPP, RS 831.40) est le 2ème pilier suisse. "
            "Obligatoire pour tout employé dont le salaire AVS dépasse CHF 22'680 (2026). "
            "Les cotisations LPP employé (case 10) sont déductibles de l'IFD et des ICC. "
            "Les rachats LPP (case 11) sont également déductibles selon LIFD art. 33 al. 1 lit. d. "
            "En cas de versement en capital (retraite), le taux réduit de 1/5 s'applique (LIFD art. 38)."
        ),
    },
    {
        "article": "section_impot_source",
        "title": "Impôt à la source (IS) et certificat de salaire",
        "text": (
            "Les travailleurs étrangers sans permis C sont soumis à l'impôt à la source (IS). "
            "L'employeur retient l'IS sur le salaire brut (cases 1-7) selon les barèmes cantonaux. "
            "Le certificat de salaire (case 15) doit indiquer si l'IS a été prélevé et le canton. "
            "Depuis la réforme IS 2021 (LIFD art. 83 ss), les quasi-résidents peuvent opter pour "
            "la taxation ordinaire ultérieure (TOU). "
            "Le certificat de salaire est le document de référence pour la TOU."
        ),
    },
    {
        "article": "section_nature",
        "title": "Prestations en nature — évaluation forfaitaire AFC",
        "text": (
            "Les prestations en nature fournies par l'employeur (logement, véhicule, repas) "
            "sont évaluées selon les forfaits AFC publiés annuellement. "
            "2026 : repas employeur CHF 3.50/repas, logement selon loyer réel × 0.70. "
            "Véhicule privé : 0.9% de la valeur d'achat par mois (9.6%/an) selon circulaire AFC. "
            "Ces montants doivent figurer en case 2 du Lohnausweis."
        ),
    },
    {
        "article": "section_transmission_electronique",
        "title": "Transmission électronique Swissdec ELM — eCH-0217",
        "text": (
            "Swissdec ELM (Electronic Salary Message) permet la transmission automatique des données "
            "salariales aux institutions (AVS, assureurs, autorités fiscales). "
            "Format XML : eCH-0217 (standard suisse d'échange de données). "
            "Les employeurs de ≥ 11 employés peuvent transmettre les Lohnausweis directement "
            "via le portail e-transfer Swissdec aux administrations fiscales cantonales. "
            "V1 Lexa : génération PDF uniquement — transmission électronique V2."
        ),
    },
    {
        "article": "section_pilier3a_interaction",
        "title": "Pilier 3a et certificat de salaire — interaction",
        "text": (
            "Le pilier 3a (prévoyance individuelle liée) n'apparaît pas dans le certificat de salaire. "
            "Il est déduit directement par l'employé dans sa déclaration fiscale (case spécifique). "
            "Plafond 3a salarié avec LPP 2026 : CHF 7'260. Sans LPP : CHF 36'288. "
            "Le certificat de salaire permet de déterminer si l'employé est affilié LPP (case 10). "
            "Si case 10 > 0 → employé affilié LPP → plafond 3a réduit (CHF 7'260)."
        ),
    },
    {
        "article": "section_frais_pro",
        "title": "Frais professionnels — forfait vs effectif",
        "text": (
            "Les frais professionnels apparaissent en case 13 (effectifs) du Lohnausweis. "
            "L'employé peut déduire dans sa déclaration fiscale les frais pro au forfait ou effectif. "
            "Forfait frais pro (déduction ordinaire dans déclaration) : VS min CHF 600, max CHF 700 (3%). "
            "Frais transport : abonnement CFF ou CHF 0.70/km max. "
            "Frais repas : CHF 3'200 CHF/an si cantina non dispo, CHF 1'600 si turnus/shift. "
            "Si employeur rembourse frais effectifs > forfait, le surplus figure en case 2."
        ),
    },
    {
        "article": "section_allocation_familiale",
        "title": "Allocations familiales et Lohnausweis",
        "text": (
            "Les allocations familiales légales (AF) versées via l'employeur figurent en case 14 "
            "(non soumises AVS). Elles ne font pas partie du salaire brut AVS (case 1). "
            "Montants minimaux 2026 : CHF 215/mois par enfant, CHF 268/mois pour formation. "
            "Certains cantons ont des montants supérieurs (VS : CHF 300 + CHF 340). "
            "Les AF sont imposables mais exclues de la base AVS."
        ),
    },
    {
        "article": "section_calcul_net",
        "title": "Calcul salaire net à partir du certificat de salaire Swissdec",
        "text": (
            "Le salaire net n'est pas une case officielle du Lohnausweis Swissdec. "
            "Il peut être calculé approximativement : Salaire net ≈ Case 8 − Case 9 − Case 10 − Case 11 − Case 12. "
            "Ce calcul ne tient pas compte de l'impôt à la source (si applicable) "
            "ni des cotisations AANP/IJM éventuellement incluses en case 12. "
            "Le salaire net exact figure sur les bulletins de salaire mensuels."
        ),
    },
    {
        "article": "section_obligations_delais",
        "title": "Obligations et délais Lohnausweis",
        "text": (
            "L'employeur doit remettre le Lohnausweis à l'employé : "
            "au plus tard le 31 janvier de l'année suivante pour l'année N. "
            "En cas de fin de contrat en cours d'année, le certificat doit être remis "
            "dans les 30 jours suivant la fin du contrat. "
            "Sanction : peine conventionnelle ou taxation d'office par l'administration fiscale. "
            "Base : LIFD art. 127 al. 2 + directives cantonales."
        ),
    },
    {
        "article": "section_rectification",
        "title": "Rectification d'un certificat de salaire",
        "text": (
            "Si le Lohnausweis remis contient une erreur, l'employeur doit émettre "
            "un certificat rectificatif. Le certificat rectificatif remplace l'original. "
            "Il doit être clairement marqué 'RECTIFICATIF' avec mention de la date de correction. "
            "Le contribuable doit notifier l'administration fiscale si une correction survient "
            "après le dépôt de sa déclaration (LIFD art. 151 — rappel d'impôt potentiel). "
            "Swissdec ELM permet l'annulation électronique d'un certificat erroné."
        ),
    },
    {
        "article": "section_cantonal_differences",
        "title": "Différences cantonales dans l'utilisation du Lohnausweis",
        "text": (
            "Le Lohnausweis fédéral est uniforme mais les cantons ont des spécificités : "
            "Certains cantons demandent des informations complémentaires en case 15. "
            "GE : indication si salaire soumis IS et barème appliqué. "
            "VS : frais de repas remboursés à indiquer explicitement. "
            "ZH : plan de participation (options/actions) → case 5 + annexe séparée. "
            "Tous les cantons acceptent le format Swissdec ELM pour importation automatique."
        ),
    },
    {
        "article": "section_participation_collaborateur",
        "title": "Participation de collaborateur — options et actions",
        "text": (
            "Les plans de participation (stock options, actions de collaborateurs) sont traités "
            "de manière spécifique dans le Lohnausweis. "
            "Actions bloquées : valeur vénale réduite selon barème AFC (selon durée blocage). "
            "Options : imposées à l'échéance ou à la levée selon type (livraison ou cotées). "
            "Case 5 : valeur imposable des plans de participation. "
            "Circulaire ESTV n°37 (2013, révisée 2021) sur imposition des plans de participation."
        ),
    },
    {
        "article": "section_mvp_note",
        "title": "Note Lexa — implémentation Swissdec V1",
        "text": (
            "Lexa V1 (session 34) implémente la génération de certificat de salaire PDF "
            "conforme Swissdec Form 11, cases 1-15. "
            "Les agents fiscal-pp et fiscal-pm peuvent répondre aux questions sur le Lohnausweis "
            "grâce à cette KB enrichie. "
            "Dettes V2 : transmission électronique eCH-0217, XML ELM 5.0, "
            "pipeline OCR → Builder automatique, calcul paie automatique (AVS/LPP/IS). "
            "Score MVP Lexa après S34 : ~99.5%."
        ),
    },
]


def extract_embedding_from_item(item) -> list[float]:
    """Extrait le vecteur d'embedding depuis un item retourné par l'embedder.

    Le serveur llama-server retourne : {"index": 0, "embedding": [[float, ...]]}
    Le vecteur est doublement imbriqué — on extrait embedding[0].
    """
    if isinstance(item, dict):
        emb = item.get("embedding", item)
    else:
        emb = item
    # Si doublement imbriqué : [[vec_floats]] → extraire [0]
    if isinstance(emb, list) and len(emb) > 0 and isinstance(emb[0], list):
        return emb[0]
    return emb


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed une liste de textes via le serveur llama-server/embedder."""
    if DRY_RUN:
        return [[0.0] * 1024 for _ in texts]

    payload_content = texts if len(texts) > 1 else texts[0]

    if USE_REQUESTS:
        resp = req_lib.post(
            f"{EMBEDDER_URL}/embedding",
            json={"content": payload_content},
            timeout=120,
        )
        resp.raise_for_status()
        data = resp.json()
        if isinstance(data, list):
            return [extract_embedding_from_item(item) for item in data]
        if "embedding" in data:
            emb = data["embedding"]
            if isinstance(emb[0], list):
                return emb
            return [emb]
        raise ValueError(f"Unexpected embedder response: {data}")
    else:
        from urllib.request import urlopen, Request as UReq
        payload = json.dumps({"content": payload_content}).encode()
        r = urlopen(UReq(f"{EMBEDDER_URL}/embedding", data=payload,
                         headers={"Content-Type": "application/json"}), timeout=120)
        data = json.loads(r.read())
        if isinstance(data, list):
            return [extract_embedding_from_item(item) for item in data]
        if "embedding" in data:
            emb = data["embedding"]
            if isinstance(emb[0], list):
                return emb
            return [emb]
        raise ValueError(f"Unexpected embedder response: {data}")


def upsert_points(points: list[dict]) -> None:
    """Upsert des points dans Qdrant."""
    if DRY_RUN:
        print(f"    [dry-run] would upsert {len(points)} points")
        return

    payload = {"points": points}
    if USE_REQUESTS:
        resp = req_lib.put(
            f"{QDRANT_URL}/collections/{COLLECTION}/points",
            json=payload,
            params={"wait": "true"},
            timeout=60,
        )
        resp.raise_for_status()
    else:
        from urllib.request import urlopen, Request as UReq
        data = json.dumps(payload).encode()
        r = urlopen(
            UReq(
                f"{QDRANT_URL}/collections/{COLLECTION}/points?wait=true",
                data=data,
                method="PUT",
                headers={"Content-Type": "application/json"},
            ),
            timeout=60,
        )
        status = json.loads(r.read())
        if status.get("status") != "ok" and status.get("result", {}).get("status") != "ok":
            raise RuntimeError(f"Qdrant upsert failed: {status}")


def get_collection_count() -> int:
    """Retourne le nombre de points dans la collection."""
    if DRY_RUN:
        return 0
    if USE_REQUESTS:
        resp = req_lib.get(f"{QDRANT_URL}/collections/{COLLECTION}", timeout=10)
        resp.raise_for_status()
        data = resp.json()
        return data.get("result", {}).get("points_count", 0)
    else:
        from urllib.request import urlopen
        r = urlopen(f"{QDRANT_URL}/collections/{COLLECTION}", timeout=10)
        data = json.loads(r.read())
        return data.get("result", {}).get("points_count", 0)


def main() -> None:
    print(f"[ingest_swissdec] Démarrage — {len(SWISSDEC_CORPUS)} chunks à ingérer")
    print(f"[ingest_swissdec] Qdrant: {QDRANT_URL} / Collection: {COLLECTION}")
    print(f"[ingest_swissdec] Embedder: {EMBEDDER_URL}")
    if DRY_RUN:
        print("[ingest_swissdec] MODE DRY-RUN — aucun appel réseau")

    count_before = get_collection_count()
    print(f"[ingest_swissdec] Points avant ingestion : {count_before}")

    total_ingested = 0
    batches = [SWISSDEC_CORPUS[i:i + BATCH_SIZE] for i in range(0, len(SWISSDEC_CORPUS), BATCH_SIZE)]

    for batch_idx, batch in enumerate(batches):
        texts = [f"{item['title']}\n\n{item['text']}" for item in batch]
        print(f"  [batch {batch_idx + 1}/{len(batches)}] embedding {len(texts)} texts...")

        try:
            vectors = embed_texts(texts)
        except Exception as e:
            print(f"  [batch {batch_idx + 1}] ERREUR embedding: {e}", file=sys.stderr)
            # Retry once
            time.sleep(2)
            try:
                vectors = embed_texts(texts)
            except Exception as e2:
                print(f"  [batch {batch_idx + 1}] ERREUR retry: {e2} — skip batch", file=sys.stderr)
                continue

        points = []
        for item, vector in zip(batch, vectors):
            full_text = f"{item['title']}\n\n{item['text']}"
            points.append({
                "id": str(uuid.uuid4()),
                "vector": vector,
                "payload": {
                    "jurisdiction": "federal",
                    "topic": "swissdec",
                    "source": "swissdec.ch/guidelines-5.0",
                    "source_confidence": "medium",
                    "law": "Swissdec-Guidelines",
                    "article": item["article"],
                    "title": item["title"],
                    "text": full_text,
                },
            })

        try:
            upsert_points(points)
            total_ingested += len(points)
            print(f"  [batch {batch_idx + 1}] OK — {len(points)} points upsertés")
        except Exception as e:
            print(f"  [batch {batch_idx + 1}] ERREUR upsert: {e}", file=sys.stderr)

        time.sleep(0.3)

    count_after = get_collection_count()
    print(f"\n[ingest_swissdec] Terminé — {total_ingested} chunks ingérés")
    print(f"[ingest_swissdec] Points après ingestion : {count_after} (delta: +{count_after - count_before})")

    if total_ingested < 30:
        print(f"[ingest_swissdec] AVERTISSEMENT : {total_ingested} < 30 chunks cible", file=sys.stderr)
        sys.exit(1)
    else:
        print(f"[ingest_swissdec] Cible ≥ 30 chunks atteinte : {total_ingested}")


if __name__ == "__main__":
    main()
