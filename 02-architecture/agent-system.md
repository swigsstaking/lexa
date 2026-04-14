# Système multi-agents Lexa

**Version** : 0.1
**Date** : 2026-04-13

---

## Principe directeur

Lexa n'est pas un chatbot fiscal. C'est un **système multi-agents orchestré**, où chaque agent a :

1. Un **rôle précis** (pas d'agent "généraliste")
2. Un **modèle préféré** (fast pour interactif, précis pour batch)
3. Un **accès à la base de connaissances** via RAG
4. Des **tools** pour lire/écrire dans l'event store
5. Une **obligation de citation** (impossible de répondre sans source)
6. Un **score de confiance** exposé à l'utilisateur

**Chaque décision agent devient un événement** dans l'event store, traçable à vie.

---

## Modèles disponibles sur le DGX Spark

| Modèle | Base | Taille | Vitesse | Usage |
|---|---|---|---|---|
| `comptable-suisse` | Qwen3.5 27B Q8 (fine-tuné) | 29 GB | ~7 tok/s | **Précision max** : fiscal complexe, batch |
| `comptable-suisse-fast` | Qwen3.5 27B Q4 (fine-tuné) | 17 GB | ~11 tok/s | **Interactif** : chat, classification temps réel |
| `qwen3.5:27b-q8_0` | Qwen3.5 27B Q8 | 29 GB | ~7 tok/s | Fallback sans system prompt spécialisé |
| `qwen3.5:27b` | Qwen3.5 27B Q4 | 17 GB | ~11 tok/s | Fallback rapide |
| `qwen3.5:9b-optimized` | Qwen3.5 9B | 10 GB | ~25 tok/s | Tâches légères (classification simple, routage) |
| `qwen3-vl-ocr` | Qwen3-VL 8B | 6.1 GB | — | **OCR principal** (photos, PDFs scannés) |
| `qwen3-vl:8b` | Qwen3-VL 8B | 6.1 GB | — | Vision générale |
| `deepseek-ocr` | DeepSeek OCR | 6.7 GB | — | OCR alternatif / fallback |
| `BGE-M3` | BGE | ~2 GB | — | **Embeddings RAG** (1024 dim, multilingue) |

**Stratégie de sélection** : chaque agent déclare son modèle préféré. Si la question est simple, on peut router vers un modèle plus léger ; si elle est complexe ou hautement sensible (fiscal), on passe au Q8 même si c'est plus lent.

---

## Les 7 agents

### 1. Agent Classifier

**Rôle** : transformer une transaction brute (ligne CAMT.053, OCR d'une facture, email parsé) en une écriture comptable complète.

**Input** :
```json
{
  "date": "2026-03-15",
  "description": "MIGROS GENEVE PLAINPALAIS",
  "amount": -47.80,
  "currency": "CHF",
  "counterparty_iban": "CH9300762011623852957",
  "document_id": "doc_xyz"
}
```

**Output** :
```json
{
  "debit_account": "6500 - Frais administratifs (autre)",
  "credit_account": "1020 - Banque",
  "amount_ttc": 47.80,
  "amount_ht": 44.19,
  "tva_rate": 8.1,
  "tva_code": "TVA-standard",
  "cost_center": "general",
  "confidence": 0.82,
  "citations": [
    {"law": "Käfer", "section": "Classe 6 - Autres charges"},
    {"law": "LTVA", "article": "25", "rs": "641.20"}
  ],
  "reasoning": "Paiement Migros = alimentation courante, catégorie frais administratifs ou frais de représentation selon contexte.",
  "alternatives": [
    {"account": "6640 - Repas", "confidence": 0.15}
  ]
}
```

**Modèle préféré** : `comptable-suisse-fast` (interactif, volume élevé)
**Escalation** : si confidence < 0.7 ou montant > 500 CHF → `comptable-suisse` (Q8)

---

### 2. Agent TVA

**Rôle** : veille trimestrielle, préparation des décomptes TVA, détection d'anomalies, choix de méthode (effective vs TDFN).

**Capacités** :
- Calcul en continu du CA imposable par taux (8.1%, 2.6%, 3.8%, exonéré)
- Surveillance du seuil CHF 100'000 (art. 10 LTVA)
- Calcul de l'impôt préalable déductible
- Détection des opérations ambiguës (prestations à l'étranger, import)
- Génération du décompte AFC en fin de trimestre
- Alerte proactive : "Votre CA approche CHF 100'000, obligation TVA à partir de…"

**Modèle préféré** : `comptable-suisse` (Q8, précision max — on ne plaisante pas avec la TVA)

---

### 3. Agent Fiscal-PP

**Rôle** : préparation de la déclaration fiscale pour personne physique (indépendants + salariés avec revenus accessoires).

**Capacités** :
- Recueil automatique des données via l'event store
- Classement des revenus (salariés, indépendants, immobiliers, mobiliers, prévoyance)
- Calcul des déductions (pilier 3a, frais professionnels, frais de transport, rachats LPP)
- Spécialisation par canton (formulaires GE, VD, FR, NE, JU, VS, BE-Jura)
- Génération du formulaire de déclaration en PDF + XML eCH-0217

**Modèle préféré** : `comptable-suisse` (Q8)

**Ressources requises (à ingérer dans la KB)** :
- Lois fiscales cantonales SR
- Barèmes annuels (mis à jour chaque année)
- Instructions officielles des formulaires de déclaration
- Circulaires cantonales

---

### 4. Agent Fiscal-PM

**Rôle** : préparation de la déclaration fiscale pour personne morale (Sàrl, SA, associations fiscalisées, fondations).

**Capacités** :
- Calcul du bénéfice imposable à partir du bénéfice comptable
- Traitement des corrections fiscales (charges non admises, provisions latentes, amortissements)
- Calcul de l'IFD (Art. 68 LIFD : 8.5% sur le bénéfice net)
- Calcul de l'impôt cantonal et communal (selon le canton)
- Calcul de l'impôt sur le capital
- Génération du bilan fiscal

**Modèle préféré** : `comptable-suisse` (Q8)

---

### 5. Agent Clôture

**Rôle** : clôture continue (pas de bouclement annuel stressant).

**Capacités** :
- Re-projection en temps réel du bilan + compte de résultat
- Détection des écritures manquantes (provisions, régularisations, amortissements)
- Préparation de l'annexe (Art. 959c CO)
- Préparation du rapport de gestion (Art. 961c CO si contrôle ordinaire)
- Respect des principes d'établissement des comptes (Art. 958c CO)

**Modèle préféré** : `comptable-suisse` (Q8)

---

### 6. Agent Conseiller

**Rôle** : optimisation proactive et veille.

**Capacités** :
- Surveillance continue du dossier (CA, bénéfice, trésorerie)
- Détection d'opportunités fiscales (amortissements accélérés, rachats LPP, 3a, réserves)
- Simulation "et si ?" (achat véhicule, embauche, dividende vs salaire)
- Alerte réglementaire (nouvelle loi, changement de taux)
- Briefing quotidien synthétique (matin)

**Modèle préféré** : `comptable-suisse` (Q8) pour les analyses, `comptable-suisse-fast` pour les interactions

**Contrainte absolue** : jamais de conseil subjectif. Toujours factuel + citation + disclaimer "vérifiez avec votre fiduciaire".

---

### 7. Agent Audit

**Rôle** : garant de l'intégrité, de l'explicabilité, de la conformité.

**Capacités** :
- Vérification de la cohérence des écritures (débit = crédit, réconciliation bancaire)
- Vérification des citations (les articles cités existent-ils ? correspondent-ils à la réponse ?)
- Détection d'hallucinations (réponse sans source, contradictions)
- Génération de l'audit trail pour exportation fiduciaire
- Surveillance de la qualité des autres agents (scoring périodique)

**Modèle préféré** : `comptable-suisse` (Q8)

---

## L'Orchestrateur

**Rôle** : distribuer les tâches aux agents appropriés, gérer la file de priorités, agréger les résultats multi-agents, arbitrer les conflits.

**Pas un modèle LLM** — c'est du code backend déterministe en TypeScript qui :

1. Reçoit une demande (utilisateur, cron, événement)
2. Classifie la demande → sélectionne le(s) agent(s)
3. Exécute en parallèle ou en séquence selon les dépendances
4. Collecte les résultats + scores de confiance
5. Décide de l'action (exécute direct, demande validation humaine, escale vers un agent plus puissant)
6. Émet les événements correspondants dans l'event store

**Modes d'exécution** :
- **Synchrone** : utilisateur pose une question → réponse immédiate
- **Asynchrone batch** : la nuit, tous les agents traitent leur backlog (classification, veille, optimisation)
- **Event-driven** : un événement arrive (transaction ingérée, facture OCRisée) → un agent est automatiquement déclenché

---

## Pipeline RAG (standard pour tous les agents)

```
Question agent
    ↓
Embedding (BGE-M3)
    ↓
Qdrant search (top-k, filter by jurisdiction + topic + date)
    ↓
Context building (articles cités + résumé)
    ↓
Prompt templating (system prompt agent-specific + context + question)
    ↓
Ollama inference (modèle choisi)
    ↓
Output parsing (structure JSON attendue)
    ↓
Validation (citations existent vraiment, format correct, confidence OK)
    ↓
Event store write (AIDecision event)
    ↓
Retour agent → orchestrateur → utilisateur
```

**Chaque étape est loguée.** En cas de problème, on peut reconstituer la décision de A à Z.

---

## Fine-tuning LoRA (à faire sur machine x86)

Le DGX Spark GB10 (aarch64) ne supporte pas torch+CUDA pour le fine-tuning. Le script `~/ollama-compta/scripts/finetune.py` est prêt mais doit tourner sur une machine x86.

**À planifier** :
- Transférer le dataset `comptable_suisse_train_500.jsonl` sur une machine avec GPU NVIDIA x86 (ou louer une instance cloud ponctuelle)
- Lancer Unsloth ou Axolotl sur Qwen3.5 27B + dataset 501 exemples
- Export en GGUF
- Import Ollama sur le Spark via `Modelfile-finetuned`
- Comparer : `comptable-suisse` (system prompt seul) vs `comptable-suisse-finetuned` (fine-tuné) sur la grille d'évaluation

**Décision en attente** : est-ce que le system prompt + RAG suffisent (score 97% déjà) ou est-ce qu'on pousse le fine-tuning pour grappiller les 3% restants + les réponses plus concises ?

---

## Prochaines étapes pour cette couche

1. Implémenter l'orchestrateur minimal (TypeScript, 1 agent = Classifier)
2. Port TypeScript du pipeline RAG existant (aujourd'hui en Python)
3. Stub API pour le bridge `event-store ↔ agents`
4. Écriture des system prompts pour chaque agent (en partant de celui existant)
5. Banc d'essai agent-by-agent avec dataset de test
