# North Star — Lexa

## La promesse en une phrase

> Une PME, un indépendant ou un fiduciaire ouvre Lexa le matin. Son IA a déjà classé toutes les écritures de la nuit, préparé la TVA du trimestre, détecté une optimisation fiscale à 3'400 CHF, cité l'article exact de la LIFD qui la permet, et prérempli la déclaration cantonale. L'utilisateur valide en 30 secondes.

**Zéro saisie. Zéro formulaire. Zéro connaissance fiscale requise.**

---

## Ce qu'on construit vraiment

Une plateforme qui :

1. **Ingère sans friction** — CAMT.053 bancaire, OCR (photo, PDF, email forward, QR-facture), import fiduciaire
2. **Classifie de manière autonome** — compte Käfer + TVA + centre de coût + analytique, avec citation légale pour chaque décision
3. **Clôture en continu** — pas de "bouclement annuel" stressant : les livres sont toujours à jour, toujours réconciliés
4. **Optimise proactivement** — l'IA surveille le chiffre d'affaires, les seuils TVA, les amortissements optimaux, les provisions admises, et alerte *avant* que ça devienne un problème
5. **Génère les déclarations officielles** — TVA (ePortal AFC), fiscale cantonale (7 cantons SR), annexes CO, certificats de salaire Swissdec, AVS/AI/APG
6. **Explique tout, cite tout** — chaque ligne, chaque décision, chaque recommandation a une source (article de loi, circulaire, ATF, Notice A)

---

## Le "2 ans d'avance" — principes d'interface

1. **Grand livre visuel, pas tabulaire** — un graphe de flux comptables remplace le plan comptable statique. Les comptes sont des nœuds, les flux sont des arêtes, les déclarations sont des vues filtrées. Zéro tableau Excel-like comme interface principale. *(V1 : graphe spécialisé plan comptable via react-flow — canvas infini générique reporté en V2, décision 2026-04-16)*
2. **Conversationnel first** — le chat est l'interface primaire, pas un gadget. "Montre-moi où part mon argent ce trimestre" → visualisation générée à la volée. Cmd+K accessible partout.
3. **Timeline fiscale interactive** — une frise temporelle permet de naviguer dans l'année fiscale. Passé consolidé, présent en cours, futur prédit par l'IA. Filtrable par compte, période, type.
4. **Wizards guidés** — les déclarations (TVA, fiscale PP/PM, Swissdec) sont accompagnées de wizards pas à pas, pas de formulaires bruts. *(Les agents visibles comme entités sur un canvas infini sont reportés en V2)*
5. **Briefing quotidien proactif** — chaque matin, un briefing vocal/textuel sur l'état financier + les décisions qui t'attendent.
6. **Multi-modal total** — photo, voix, drag-drop, email forward, scan QR, upload PDF — tout se transforme en écriture comptable citée.

---

## Ce qu'on NE fera PAS

- ❌ Pas de formulaires à remplir manuellement
- ❌ Pas de tableaux Excel-like comme interface principale
- ❌ Pas de cloud — **tout tourne en local sur le DGX Spark**
- ❌ Pas de conseil subjectif — toujours factuel avec citation
- ❌ Pas de "conseiller fiscal" qui assume la responsabilité (phase 1) — Lexa reste un outil qui prépare, l'humain valide
- ❌ Pas de dépendance à un modèle cloud (OpenAI, Anthropic, Mistral API) — carte blanche locale uniquement

---

## Critère de succès à 24 mois

Un indépendant romand peut passer une année fiscale entière sur Lexa et, en avril, générer et déposer sa déclaration cantonale + fédérale sans jamais avoir :

- Ouvert un fichier Excel
- Consulté un fiduciaire pour ses opérations courantes
- Saisi manuellement une écriture
- Lu un article de loi fiscal

Et il aurait épargné en moyenne **2'000 à 5'000 CHF d'impôts** grâce à l'optimisation continue que Lexa aura détectée tout au long de l'année.
