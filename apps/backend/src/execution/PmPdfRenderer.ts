/**
 * PmPdfRenderer — Rendu PDF officiel déclaration PM Valais
 * Session 27
 *
 * Clone du pattern VsPpPdfRenderer, adapté au schéma PM (bilan, résultat,
 * corrections fiscales, capital imposable, estimation IFD + ICC VS).
 */

import PDFDocument from "pdfkit";
import type { PmDeclarationVs } from "./PmFormBuilder.js";

function chf(n: number | undefined | null): string {
  if (n === undefined || n === null || Number.isNaN(n)) return "—";
  return n.toLocaleString("fr-CH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function pct(n: number | undefined | null): string {
  if (n === undefined || n === null || Number.isNaN(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

const DISCLAIMER =
  "Information à titre indicatif — vérifiez avec votre fiduciaire et le " +
  "Service cantonal des contributions VS (SCC). Ce document n'a pas valeur légale.";

export async function renderPmPdf(form: PmDeclarationVs): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 48, bottom: 48, left: 48, right: 48 },
    info: {
      Title: `Déclaration PM VS ${form.year} — ${form.company.legalName}`,
      Author: "Lexa",
      Subject: "Déclaration fiscale PM Canton du Valais",
    },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  const colX = { label: 48, val: 430 };

  function row(label: string, value: string | number | undefined | null, bold = false) {
    const y = doc.y;
    if (bold) doc.font("Helvetica-Bold");
    const displayVal = typeof value === "number" ? chf(value) : (value ?? "—");
    doc.text(String(label), colX.label, y);
    doc.text(String(displayVal), colX.val, y, { width: 110, align: "right" });
    if (bold) doc.font("Helvetica");
    doc.moveDown(0.4);
  }

  function separator() {
    doc.strokeColor("#e5e7eb").moveTo(48, doc.y + 2).lineTo(540, doc.y + 2).stroke();
    doc.moveDown(0.5);
  }

  function sectionTitle(title: string) {
    doc.fillColor("#0b0b0f").fontSize(11).text(title, { underline: true });
    doc.moveDown(0.3);
    doc.fontSize(10);
  }

  // ── Header ─────────────────────────────────────────────────────────────────
  doc.fontSize(18).fillColor("#0b0b0f").text("Déclaration d'impôt PM", { align: "left" });
  doc.fontSize(10).fillColor("#71717a").text(
    "Canton du Valais — Service cantonal des contributions (SCC)"
  );
  doc.fontSize(9).text(
    `LIFD art. 58, 68, 75 · CO art. 958, 959 · LHID art. 24 — Année fiscale ${form.year}`
  );
  doc.moveDown(1);

  // ── Disclaimer rouge ───────────────────────────────────────────────────────
  doc.rect(doc.x, doc.y, 500, 42).fillAndStroke("#fef2f2", "#ef4444");
  doc.fillColor("#991b1b").fontSize(8).text(
    DISCLAIMER.trim(),
    doc.x + 8,
    doc.y + 8,
    { width: 484 },
  );
  doc.moveDown(4);
  doc.x = 48;

  // ── Section 1 : Identité société ───────────────────────────────────────────
  sectionTitle("1. Identité de la société");
  doc.fillColor("#0b0b0f").fontSize(10);
  row("Raison sociale", form.company.legalName);
  row("Forme juridique", form.company.legalForm === "sa" ? "Société Anonyme (SA)" : "Société à responsabilité limitée (Sàrl)");
  row("Numéro IDE", form.company.ideNumber ?? "—");
  row("Siège / domicile fiscal", form.company.registeredOffice ?? (form.company.commune ?? "—"));
  row("Canton", "VS — Valais");
  row("Année fiscale", String(form.year));
  doc.moveDown(0.8);

  // ── Section 2 : États financiers ───────────────────────────────────────────
  sectionTitle("2. États financiers résumés");
  row("Bénéfice comptable (avant corrections)", form.financials.benefitAccounting);
  row("Corrections fiscales (charges non admises, etc.)", form.financials.corrections);
  separator();
  row("Bénéfice net imposable", form.benefitImposable, true);
  doc.moveDown(0.8);

  // ── Section 3 : Capital imposable ──────────────────────────────────────────
  sectionTitle("3. Capital et fonds propres imposables");
  row("Capital imposable (fonds propres)", form.financials.capital);
  doc.moveDown(0.8);

  // ── Section 4 : Estimation des impôts ─────────────────────────────────────
  sectionTitle("4. Estimation des impôts — VS 2026");
  const t = form.taxEstimate;
  row("IFD 8.5% (art. 68 LIFD) sur bénéfice net", t.ifd);
  row("ICC VS ~8.5% sur bénéfice net (LF VS section PM)", t.icc);
  row("Impôt sur capital 0.15% (LF VS)", t.capitalTax);
  separator();
  row("Total estimé", t.total, true);
  row("Taux effectif estimé", pct(t.effectiveRate));
  doc.moveDown(0.8);

  // ── Section 5 : Citations légales ──────────────────────────────────────────
  sectionTitle("5. Citations légales");
  doc.fontSize(8).fillColor("#52525b");
  for (const cite of form.citations) {
    doc.text(`${cite.law} ${cite.article} : ${cite.text}`, {
      width: 492,
      indent: 0,
      paragraphGap: 4,
    });
    doc.moveDown(0.4);
  }
  doc.moveDown(0.4);

  // ── Footer ─────────────────────────────────────────────────────────────────
  doc.fontSize(8).fillColor("#71717a").text(
    `Généré par Lexa le ${new Date(form.generatedAt).toLocaleString("fr-CH")} · ` +
    `Formulaire ${form.formId} v${form.version} · ` +
    `Autorité SCC VS`,
    48,
    780,
    { width: 500, align: "center" },
  );

  // Disclaimer bas de page (répété — exigé)
  doc.fontSize(7).fillColor("#a1a1aa").text(
    DISCLAIMER,
    48,
    800,
    { width: 500, align: "center" },
  );

  doc.end();
  return done;
}
