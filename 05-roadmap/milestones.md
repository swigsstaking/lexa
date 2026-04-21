# Lexa — Roadmap 24 mois

**Version** : 0.1
**Date de départ** : 2026-04-13
**Horizon** : T4 2027 (lancement public)

---

## Synthèse

Grâce au prototype existant sur le DGX Spark (`~/ollama-compta/` avec Qdrant + BGE-M3 + modèle fine-tuné + 776 articles Fedlex), on gagne **4 à 5 mois** sur une roadmap "from scratch" théorique.

**8 trimestres** pour passer de rien à un produit lancé publiquement avec :
- Compta automatisée (ingestion CAMT.053 + OCR + classification IA)
- TVA complète (effective + TDFN)
- Clôture continue CO
- Déclarations fiscales PP et PM pour les 7 cantons SR
- Mode fiduciaire multi-clients
- Interface grand livre visuel + Linear-like (dense, exploratoire)

---

## T1 2026 (avril → juin 2026) — Fondations documentaires & KB fédérale

### Objectifs
- Whitepaper figé en v1
- Architecture validée et documentée
- Base de connaissances fédérale complétée (passer de 60% à 100% du fédéral)
- Pipeline RAG prêt pour intégration produit
- Décision finale sur le canvas (react-flow vs tldraw)

### Livrables
- [ ] Whitepaper v1 (ce doc + enrichissements)
- [ ] `02-architecture/overview.md` figé
- [ ] `02-architecture/agent-system.md` figé
- [ ] LHID ingéré dans Qdrant
- [ ] OIFD + OLTVA ingérés
- [ ] LP ingéré
- [ ] Notices AFC principales ingérées (Notice A, Notice 1, Info TVA 01/03/14)
- [ ] Prototype canvas (comparaison react-flow vs tldraw sur use case compta)
- [ ] Design system de base (Tailwind config, typographie, palette)
- [ ] Decision log : choix stack final
- [ ] Fine-tuning LoRA lancé sur machine x86 (si on décide de le faire)

### Pas encore fait
- Pas de backend Lexa
- Pas de frontend Lexa
- Pas d'ingestion cantonale

---

## T2 2026 (juillet → septembre 2026) — Backend + agents classifier & TVA

### Objectifs
- Monter le backend Lexa from scratch
- Event-sourcing Postgres opérationnel
- Agent Classifier fonctionnel (via port TypeScript du pipeline RAG)
- Agent TVA fonctionnel
- Ingestion CAMT.053 (parser + import)
- Premier OCR pipeline intégré (réutilise le service existant)

### Livrables
- [ ] Repo `lexa-backend` (Node.js + Express + TypeScript)
- [ ] Event store Postgres schéma + migrations
- [ ] Orchestrator minimal (TypeScript)
- [ ] Agent Classifier + test suite
- [ ] Agent TVA + test suite
- [ ] Parser CAMT.053
- [ ] Endpoint OCR + intégration `~/ocr-service/`
- [ ] SSO Hub intégration (même pattern que Swigs Pro)
- [ ] Multi-tenant de base (tenant_id + RLS Postgres)
- [ ] Premier API REST documentée (OpenAPI)

### Pas encore
- Pas de frontend
- Pas de déclarations fiscales
- Pas de clôture

---

## T3 2026 (octobre → décembre 2026) — Frontend MVP & Alpha interne

### Objectifs
- Frontend Lexa monté
- Canvas spatial en production
- Chat conversationnel first
- MVP utilisable en interne (toi + 1-2 testeurs amis)

### Livrables
- [ ] Repo `lexa-frontend` (React + Vite)
- [ ] Canvas de compta spatial (react-flow OU tldraw)
- [ ] Chat conversationnel intégré au canvas
- [ ] Timeline fiscale (scroll temporel)
- [ ] Dashboard multi-vues (canvas, timeline, documents, livres)
- [ ] Agents visibles sur le canvas (indicateurs visuels)
- [ ] Upload multi-modal (photo, PDF, CAMT.053, email forward)
- [ ] Classification + validation humaine en boucle
- [ ] Génération décompte TVA AFC (PDF)
- [ ] Test alpha avec 1-2 comptes réels (ton propre dossier ?)

### Critère de succès
- Un utilisateur peut importer son CAMT.053, voir toutes ses transactions classifiées automatiquement, corriger les cas ambigus, et générer son décompte TVA trimestriel.

---

## T4 2026 (janvier → mars 2027) — Beta privée + premier canton SR (Valais)

### Objectifs
- Ingestion complète du cantonal **Valais**
- Agent Fiscal-PP VS fonctionnel
- Beta privée avec 3-5 fiduciaires partenaires valaisans
- Feedback loop intensif

### Livrables
- [ ] Lois VS ingérées (LF RSVS 642.1)
- [ ] Règlement d'exécution VS (RELF)
- [ ] Barème VS 2026
- [ ] Coefficients communaux VS (liste par commune)
- [ ] Formulaires VS PP + PM (templates YAML)
- [ ] Agent Fiscal-PP VS
- [ ] Simulateur fiscal PP VS
- [ ] Génération déclaration PP VS (PDF + XML eCH-0217 si dispo)
- [ ] Gestion des spécificités touristiques (TVA 3.8% hébergement, autres)
- [ ] Recrutement de 3-5 fiduciaires beta valaisans
- [ ] Contrats beta + NDA
- [ ] Plateforme de feedback
- [ ] Analytics d'usage

### Critère de succès
- Un fiduciaire valaisan peut préparer une déclaration PP VS complète dans Lexa, en utilisant les données d'un client réel, en moins de 30 minutes (vs 2-3 heures aujourd'hui).

---

## T1 2027 (avril → juin 2027) — Clôture continue + canton GE

### Objectifs
- Clôture continue CO opérationnelle
- Agent Clôture + Agent Audit
- Ingestion canton **Genève** (2e canton après VS)
- Agent Fiscal-PP GE

### Livrables
- [ ] Projections continues (bilan, compte de résultat, annexe CO 959c)
- [ ] Agent Clôture
- [ ] Agent Audit (vérification cohérence écritures + citations)
- [ ] Rapport de gestion CO 961c (PDF généré)
- [ ] Ingestion lois GE (LCP, LIPP, LIPM)
- [ ] Règlements d'application GE
- [ ] Barèmes GE 2027
- [ ] Agent Fiscal-PP GE
- [ ] Recrutement de 2-3 fiduciaires beta genevois (en plus des valaisans)
- [ ] Tests croisés beta VS + GE
- [ ] Corrections prioritaires suite feedback alpha/beta

---

## T2 2027 (juillet → septembre 2027) — Agent Fiscal-PM + annexes CO

### Objectifs
- Déclaration fiscale personne morale (Sàrl/SA)
- Bilan fiscal + corrections fiscales
- Annexes CO complètes
- Mode avancé fiduciaire (premiers éléments multi-clients)

### Livrables
- [ ] Agent Fiscal-PM
- [ ] Calcul du bénéfice imposable (à partir du bénéfice comptable)
- [ ] Gestion des corrections fiscales (charges non admises, amortissements, provisions latentes)
- [ ] Calcul IFD (Art. 68 LIFD)
- [ ] Calcul ICC (GE, VD, FR)
- [ ] Calcul impôt sur le capital
- [ ] Génération bilan fiscal PDF
- [ ] Annexe 959c complète
- [ ] Tableau de financement (si applicable)
- [ ] Premier mode "switcher entre clients" pour fiduciaires

---

## T3 2027 (octobre → décembre 2027) — Cantons restants + Swissdec + Mode fiduciaire

### Objectifs
- Compléter les 7 cantons SR (VD + FR + NE + JU + BE-Jura)
- Intégration Swissdec salaires
- Mode fiduciaire complet (multi-clients, dashboard alertes, délégation)

### Livrables
- [ ] Ingestion VD + FR + NE + JU + BE-Jura (lois, règlements, barèmes, formulaires)
- [ ] Agents Fiscal-PP + PM pour ces 5 cantons
- [ ] Intégration Swissdec (envoi certificats de salaire + décomptes AVS/AI/APG)
- [ ] Mode fiduciaire : dashboard multi-clients
- [ ] Délégation de validation (lien sécurisé envoyé au client)
- [ ] Facturation interne du fiduciaire à ses clients via Swigs Pro (bridge)
- [ ] Tests de charge (100+ clients par fiduciaire)

---

## T4 2027 (janvier → mars 2028) — Optimisation continue & Lancement public

### Objectifs
- Agent Conseiller (optimisation proactive)
- Intégrations portails officiels (dépôt automatique TVA AFC, fiscal cantonal)
- Lancement public
- Marketing & communication

### Livrables
- [ ] Agent Conseiller opérationnel
- [ ] Briefing quotidien vocal (si TTS local) ou textuel
- [ ] Simulations "et si ?" (achat véhicule, dividende vs salaire, 3a, rachat LPP)
- [ ] Veille réglementaire automatique (Fedlex RSS + sites cantonaux)
- [ ] Dépôt automatique TVA via ePortal AFC (si API disponible)
- [ ] Site web de lancement
- [ ] Onboarding automatisé (first-run experience)
- [ ] Tarification finalisée
- [ ] Pricing page
- [ ] Press kit
- [ ] **Audit fiduciaire externe final** (validation par un cabinet fiduciaire partenaire — stratégie : on s'appuie sur les agents experts IA pendant tout le dev, on ne valide avec un humain qu'à la fin)
- [ ] **Lancement public T1 2028**

---

## Post-lancement (2028+)

### Fonctionnalités v2
- Cantons alémaniques (ZH, BE, AG, SG…)
- Cantons italophones (TI)
- LPP coordination (intégration caisses)
- Factoring / escompte (intégration bancaire)
- Voice interface avancée
- Mobile app (React Native)
- Mode "Lexa assume" (avec RC professionnelle)

### Ambition long terme
- Devenir **la référence** de la compta IA en Suisse
- Export vers d'autres pays avec des systèmes fiscaux complexes (Luxembourg, Belgique, Monaco ?)
- API publique pour que d'autres produits Swiss tech bâtissent dessus

---

## Jalons de décision (go/no-go)

| Date | Décision | Critère |
|---|---|---|
| Fin T1 2026 | Canvas library | Benchmark react-flow vs tldraw |
| Fin T2 2026 | Continuer stack ou pivoter | Performance event store + agents OK ? |
| Fin T3 2026 | Passer en alpha externe | MVP autonome sur un dossier réel ? |
| Fin T4 2026 | Étendre aux autres cantons | Beta fiduciaire GE satisfaite ? |
| Fin T2 2027 | Lancer en public ou retarder | Fiscal PM stable ? |
| Fin T4 2027 | Pricing final + lancement | Audit fiduciaire validé ? |

---

## Contraintes de l'équipe (toi + moi)

- Pas de recrutement prévu
- Pas de budget externe
- Contrainte temps : maintien de Swigs Pro et autres projets Swigs en parallèle
- Donc : **être ultra-disciplinés sur le scope** et éviter toute dispersion
- Principe : **shipper un trimestre utile** plutôt que courir après 3 fronts en parallèle
