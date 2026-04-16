# Lane J — QR-facture suisse scan (2026-04-16)

## Objectif

Ajouter la détection de QR-factures suisses (Swiss QR-bill ISO 20022) dans le pipeline OCR
existant. Combler le gap whitepaper §1 point 6 "Multi-modal total".

## Livraisons

### 1. QrFactureParser.ts (nouveau)

`apps/backend/src/services/QrFactureParser.ts`

- `parseQrBillString(qrContent)` — parse les 32+ lignes du format SPC/0200 → `SwissQrBill`
- `scanQrFromImage(imageBuffer)` — décode un QR code depuis buffer PNG/JPEG via jsqr + @napi-rs/canvas
- `scanAndParseQrBill(imageBuffer)` — pipeline complet image → QR → SPC
- Types exportés : `SwissQrBill`, `QrBillAddress`

Validation : prise en charge addressType S (structured) et K (combined), montant vide (à saisir),
ultimate creditor optionnel, schémas alternatifs (eBill).

### 2. OcrExtractor.ts — Stage 0.5

Extension de `extractRawText()` : scan QR non-bloquant en parallèle de l'OCR textuel.

- Path PDF avec texte : conversion PNG en best-effort pour scan QR
- Path PDF→PNG (existant) : réutilise le buffer PNG déjà généré
- Path image directe : scan immédiat

Si QR-facture détecté dans `extractDocument()` :
- Force le type doc à `facture` (si était `autre`)
- Enrichit `extractedFields` avec `qrBill: SwissQrBill`
- Surcharge `iban`, `amountTtc`, `reference`, `vendor` depuis les données QR

### 3. Badge UI — Documents.tsx

Composant `QrBadge` dans DocumentCard : affiche badge emerald avec icône QrCode (Lucide),
montant formaté fr-CH, nom créancier si présent. Visible uniquement si `qrBill` dans extractedFields.

### 4. Fixture qa-lexa

Test `qr-facture-1-parse-string` : 11 assertions sur une chaîne QR-facture fixture complète
(IBAN, créancier, débiteur, montant, devise, référence QRR, trailer EPD, schéma alternatif).

## Dépendances

- `jsqr@1.4.0` installé (backend + prod)
- `@napi-rs/canvas` déjà présent (S25)
- Aucune dépendance système (pure JS)

## Score whitepaper §1 "Multi-modal total"

- Avant : ~40% (OCR texte + vision)
- Après : ~55% (+ QR decode structuré, données ISO 20022 natives)

## Scope V1.1 (non inclus)

- Validation IBAN checksum Modulo 10
- Auto-création transaction bancaire depuis QR
- PDF multi-pages QR (V1 : page 1 uniquement)
- Test E2E upload PDF avec QR code réel (fixture string parsing validée)
