/**
 * Génère un PDF de certificat de salaire de test stable.
 * Utilisé pour les fixtures qa-lexa (session 24).
 *
 * Session 34 : PDF enrichi avec cases Swissdec explicites (1, 8, 9, 10)
 * pour permettre à l'OCR stage 2 d'extraire les champs case* normalisés.
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
  .text("Formulaire officiel — AFC Suisse / Swissdec Form 11", { align: "center" });

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
  .text("IDE : CHE-100.200.300")
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

// Cases Swissdec (nomenclature officielle Lohnausweis)
doc
  .fontSize(12)
  .font("Helvetica-Bold")
  .text("Rémunération — Cases Swissdec (Lohnausweis Form 11)");

doc.moveDown(0.5);
doc
  .fontSize(11)
  .font("Helvetica")
  .text("Case 1 - Salaire annuel brut soumis AVS : CHF 85'000.00")
  .text("Case 7 - Autres prestations (13ème salaire) : CHF 0.00")
  .text("Case 8 - Total salaire brut : CHF 85'000.00")
  .text("Case 9 - Cotisations AVS/AI/APG/AC (employé) : CHF 5'525.00")
  .text("Case 10 - Cotisations LPP ordinaires : CHF 5'250.00")
  .text("Case 12 - Autres déductions : CHF 0.00")
  .text("Case 13 - Frais effectifs remboursés : CHF 0.00");

doc.moveDown(1);

// Récapitulatif calcul net
doc
  .fontSize(12)
  .font("Helvetica-Bold")
  .text("Récapitulatif");

doc.moveDown(0.5);
doc
  .fontSize(11)
  .font("Helvetica")
  .text("Total déductions salariales : CHF 10'775.00")
  .text("Salaire net versé : CHF 74'225.00");

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
  console.log("[gen-test-cert] Contenu attendu par l'OCR (session 34 — Swissdec) :");
  console.log("  - type: certificat_salaire");
  console.log("  - case1_salaireBrut: 85000");
  console.log("  - case8_totalBrut: 85000");
  console.log("  - case9_cotisationsSociales: 5525");
  console.log("  - case10_lppOrdinaire: 5250");
  console.log("  - grossSalary: 85000 (legacy compat)");
  console.log("  - netSalary: 74225");
  console.log("  - employer: Lexa Test SA");
});

stream.on("error", (err) => {
  console.error("[gen-test-cert] Erreur :", err);
  process.exit(1);
});
