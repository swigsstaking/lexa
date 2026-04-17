# Lane O — V1 dettes critiques (2026-04-17)

## Tâche 1 : Balance filtrée par période ✅

**Problème** : `LedgerCanvas` filtrait les `entries` par période mais passait
`balance.data.accounts` (soldes année entière) à `buildCanvas`. Incohérence
visuelle : les nodes affichaient des soldes qui ne correspondaient pas aux
écritures visibles.

**Fix** : Ajout de `recomputeBalances(accounts, filteredEntries)` appelé via
`accountsForPeriod` useMemo. Bypass si `period.key === 'all'` (données API
déjà correctes). Le `LedgerDrawer` reçoit désormais `accountsForPeriod` à la
place de `balance.data?.accounts`.

Fichier modifié : `apps/frontend/src/components/canvas/LedgerCanvas.tsx`

---

## Tâche 2 : UI CAMT.053 upload dans /documents ✅

**Ajouts** :
- `lexa.uploadCamt053(file: File)` dans `apps/frontend/src/api/lexa.ts`
  → POST `/connectors/camt053/upload` multipart, retourne `{ imported, skipped, message }`
- Section "Import bancaire CAMT.053" dans `apps/frontend/src/routes/Documents.tsx`
  → Input file `.xml`, bouton "Importer le relevé", feedback succès/erreur
  → Icône `Landmark` (lucide), style cohérent avec section OCR existante
  → Invalide les query keys `['ledger']` et `['balance']` après succès pour
    mettre à jour LedgerCanvas automatiquement

Fichiers modifiés :
- `apps/frontend/src/api/lexa.ts`
- `apps/frontend/src/routes/Documents.tsx`

---

## Tâche 3 : Drill-down pièce justificative — DETTE DOCUMENTÉE

**Statut** : Non implémenté — champ absent du type.

**Constat** : `LedgerEntry` (défini dans `apps/frontend/src/api/types.ts` ligne 131)
ne contient ni `documentId` ni `metadata`. Le schéma backend ne propage pas
de référence vers un document OCR depuis les écritures comptables.

**Dette** : Pour implémenter le drill-down pièce justificative, il faudra :
1. Backend : ajouter `documentId?: string` sur le modèle Event / LedgerEntry
   et le populer lors de la création d'une écriture depuis un document OCR
   (flow : `POST /documents/upload` → extraction → création `LedgerEntry`
   avec référence au `documentId`)
2. Frontend type : ajouter `documentId?: string` dans `LedgerEntry`
   (`apps/frontend/src/api/types.ts`)
3. Frontend UI : dans `LedgerDrawer.tsx` > `TxRow`, afficher icône `Paperclip`
   cliquable si `tx.documentId` présent → `navigate('/documents')` ou
   ouverture directe via `/api/documents/${tx.documentId}/binary`

Estimation : ~1h backend + 30min frontend quand la donnée est disponible.
