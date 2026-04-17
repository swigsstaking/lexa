# NEXT SESSION — Plan V1 Lexa

**Dernière session** : ~S38+ (2026-04-17) — Workspace polish + dettes V1 + handoff
**Prochaine instance mère** : nouvelle conversation Opus 4.6
**Score whitepaper** : ~87%
**Objectif V1** : tous les utilisateurs peuvent utiliser l'outil, importer documents, terminer le whitepaper

---

## Ce qui marche (vérifié 2026-04-17)

- Grand livre visuel interactif `/workspace` (flux G→D, click, drawer, modal période, Käfer labels)
- 8 wizards (4 PP + 4 PM) avec PDF + estimateur fiscal
- OCR pipeline + QR-facture + CAMT.053 import
- 14 agents IA actifs (7 rôles whitepaper)
- Mode fiduciaire multi-tenant + RLS 4/4
- Queue LLM BullMQ (0 timeout sous charge)
- Swissdec Form 11

## Plan V1 restant (~8-10 sessions)

### P1 — Beta utilisable
- A : Onboarding utilisateur (flow inscription → premier dossier)
- B : Email forward IMAP → OCR auto
- C : Drill-down pièce justificative (documentId sur LedgerEntry)
- D : Briefing quotidien Conseiller (cron schedule)

### P2 — Polish
- E : Ratios métier Workspace (CA/marge/trésorerie)
- F : Collapse comptes 50+ (Käfer classes)
- G : Test de charge + E2E regression

### P3 — Whitepaper completion
- H : eCH-0217 XML export
- I : Clôture continue enrichie (détection auto)
- J : Audit fiduciaire + launch prep

## ⚠️ Avertissements critiques

1. **DEPLOY** : Lexa = `/home/swigs/lexa-frontend/`. Pro = `/home/swigs/swigs-workflow-frontend/`. **JAMAIS confondre**
2. **Problèmes visuels** : screenshot MCP SOI-MÊME avant agents aveugles
3. **Design** : user aime l'actuel, 0 refonte esthétique
4. **Agents dev** : `bypassPermissions` + `sonnet`. Jamais `mode: plan`
5. **Canvas spatial** → reporté V2 (décision 2026-04-16)

## Fichiers handoff

- `memory/lexa-handoff-v1.md` — état complet, infrastructure, scores, patterns, incidents
- `memory/patterns-dev-lexa.md` — patterns mère/Sonnet
- `memory/gotchas-lexa.md` — pièges durables
- `memory/infra-lexa.md` — paths, ports, modèles
