/**
 * Génère un PDF de certificat de salaire de test stable.
 * Utilisé pour les fixtures qa-lexa (session 24).
 *
 * Exécution : tsx src/scripts/gen-test-cert-salaire.ts
 * Output : src/scripts/fixtures/test-cert-salaire.pdf
 */

import PDFDocument from "pdfkit";
import { createWriteStream, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, "fixtures");
const OUTPUT_PATH = join(OUTPUT_DIR, "test-cert-salaire.pdf");

mkdirSync(OUTPUT_DIR, { recursive: true });

const doc = new PDFDocument({ size: "A4", margin: 50 });
const stream = createWriteStream(OUTPUT_PATH);
doc.pipe(stream);

// En-tête
doc
  .fontSize(20)
  .font("Helvetica-Bold")
  .text("CERTIFICAT DE SALAIRE 2025", { align: "center" });

doc.moveDown(0.5);
doc
  .fontSize(10)
  .font("Helvetica")
  .text("Formulaire officiel — AFC Suisse", { align: "center" });

doc.moveDown(1.5);

// Employeur
doc
  .fontSize(12)
  .font("Helvetica-Bold")
  .text("Informations employeur");

doc.moveDown(0.5);
doc
  .fontSize(11)
  .font("Helvetica")
  .text("Employeur : Lexa Test SA")
  .text("Adresse : Rue du Grand-Pont 12, 1950 Sion")
  .text("Numéro AVS employeur : 109.123.456");

doc.moveDown(1);

// Employé
doc
  .fontSize(12)
  .font("Helvetica-Bold")
  .text("Informations employé");

doc.moveDown(0.5);
doc
  .fontSize(11)
  .font("Helvetica")
  .text("Nom : TEST Jean")
  .text("Adresse : Chemin des Fleurs 5, 1950 Sion")
  .text("Numéro AVS : 756.1234.5678.97")
  .text("Période d'emploi : 01.01.2025 - 31.12.2025");

doc.moveDown(1);

// Salaires
doc
  .fontSize(12)
  .font("Helvetica-Bold")
  .text("Rémunération");

doc.moveDown(0.5);
doc
  .fontSize(11)
  .font("Helvetica")
  .text("Salaire brut annuel : CHF 85'000.00")
  .text("Déductions AVS/AI/APG : CHF 4'420.00")
  .text("Déductions AC : CHF 1'147.50")
  .text("Déductions AANP (si applicable) : CHF 512.50")
  .text("Déductions LPP : CHF 6'420.00")
  .text("Total déductions salariales : CHF 12'500.00")
  .text("Salaire net versé : CHF 72'500.00");

doc.moveDown(1);

// Autres informations
doc
  .fontSize(12)
  .font("Helvetica-Bold")
  .text("Autres informations");

doc.moveDown(0.5);
doc
  .fontSize(11)
  .font("Helvetica")
  .text("Chiffre 9 (cotisations LPP) : CHF 6'420.00")
  .text("Chiffre 12.1 (frais effectifs) : Non")
  .text("Impôt à la source prélevé : Non");

doc.moveDown(2);

// Signature
doc
  .fontSize(10)
  .font("Helvetica")
  .text("Sion, le 31 janvier 2026", { align: "right" })
  .moveDown(0.5)
  .text("Signature employeur : ________________", { align: "right" });

doc.end();

stream.on("finish", () => {
  console.log(`[gen-test-cert] PDF généré : ${OUTPUT_PATH}`);
  console.log("[gen-test-cert] Contenu attendu par l'OCR :");
  console.log("  - type: certificat_salaire");
  console.log("  - grossSalary: 85000");
  console.log("  - netSalary: 72500");
  console.log("  - employer: Lexa Test SA");
});

stream.on("error", (err) => {
  console.error("[gen-test-cert] Erreur :", err);
  process.exit(1);
});
