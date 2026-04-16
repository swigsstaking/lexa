/**
 * SwissdecCertificateBuilder — Générateur de certificat de salaire (Form 11)
 * conforme Swissdec Guidelines 5.0.
 *
 * Session 34 — S34 Swissdec salaires V1.
 *
 * Input  : CertificateInput (Zod-validé)
 * Output : { pdfBase64, structuredData, citations }
 *
 * Note V1 :
 * - Pas de transmission électronique eCH-0217 (V2)
 * - Pas de calcul paie automatique (AVS/LPP/IS) — les montants sont fournis par l'appelant
 * - Layout A4 lisible, pas pixel-perfect Form 11 officiel
 */

import { z } from "zod";
import PDFDocument from "pdfkit";

// ── Zod Schema ────────────────────────────────────────────────────────────────

export const EmployerSchema = z.object({
  legalName: z.string().min(1).max(200),
  address: z.string().min(1).max(300),
  ideNumber: z.string().optional(),
  avsNumber: z.string().optional(),
});

export const EmployeeSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  avsNumber: z.string().optional(),
  address: z.string().optional(),
});

export const CasesSchema = z.object({
  case1_salaireBrut: z.number().nonnegative(),
  case7_autresPrestations: z.number().nonnegative().optional(),
  case8_totalBrut: z.number().nonnegative(),
  case9_cotisationsSociales: z.number().nonnegative(),
  case10_lppOrdinaire: z.number().nonnegative().optional(),
  case11_lppRachats: z.number().nonnegative().optional(),
  case12_autresDeductions: z.number().nonnegative().optional(),
  case13_fraisEffectifs: z.number().nonnegative().optional(),
  case14_prestationsNonSoumises: z.number().nonnegative().optional(),
  case15_remarques: z.string().max(500).optional(),
});

export const CertificateInput = z.object({
  employer: EmployerSchema,
  employee: EmployeeSchema,
  year: z.number().int().min(2020).max(2100),
  period: z.object({
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
  cases: CasesSchema,
});

export type CertificateInputType = z.infer<typeof CertificateInput>;

// ── PDF helpers ───────────────────────────────────────────────────────────────

function chf(n: number | undefined | null): string {
  if (n === undefined || n === null || Number.isNaN(n)) return "—";
  return `CHF ${n.toLocaleString("fr-CH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

const BRAND_COLOR = "#1a3c6e"; // bleu AFC
const LINE_COLOR = "#d1d5db";
const DISCLAIMER =
  "Certificat généré par Lexa — vérifier avec votre fiduciaire avant transmission à l'autorité fiscale.";
const LEGAL_CITATION =
  "LIFD art. 127 al. 1 lit. a + Swissdec Guidelines 5.0 (Lohnausweis Form 11)";

// ── Renderer PDF ─────────────────────────────────────────────────────────────

async function renderCertificatePdf(input: CertificateInputType): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 40, bottom: 40, left: 48, right: 48 },
    info: {
      Title: `Certificat de salaire ${input.year} — ${input.employee.lastName} ${input.employee.firstName}`,
      Author: "Lexa",
      Subject: "Certificat de salaire Swissdec Form 11",
    },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  // ── Helper functions ──────────────────────────────────────────────────────

  function hrule(marginTop = 4) {
    doc.moveDown(marginTop / 12);
    doc.strokeColor(LINE_COLOR).lineWidth(0.5).moveTo(48, doc.y).lineTo(544, doc.y).stroke();
    doc.moveDown(0.4);
  }

  function sectionHeader(text: string) {
    doc.moveDown(0.3);
    doc
      .fillColor(BRAND_COLOR)
      .fontSize(10)
      .font("Helvetica-Bold")
      .text(text.toUpperCase(), { continued: false });
    doc.moveDown(0.2);
    doc.fillColor("#000000").font("Helvetica").fontSize(9.5);
  }

  function kv(label: string, value: string | undefined | null) {
    if (!value) return;
    const y = doc.y;
    doc.font("Helvetica-Bold").fontSize(9).text(label, 48, y, { width: 180, continued: false });
    doc.font("Helvetica").fontSize(9).text(value, 240, y, { width: 304, continued: false });
    if (doc.y < y + 12) doc.y = y + 13;
    doc.moveDown(0.15);
  }

  function caseRow(caseNum: string, label: string, amount: number | undefined) {
    if (amount === undefined) return;
    const y = doc.y;
    // Case number badge
    doc
      .fillColor(BRAND_COLOR)
      .font("Helvetica-Bold")
      .fontSize(9)
      .text(`Case ${caseNum}`, 48, y, { width: 55, continued: false });
    // Label
    doc.fillColor("#111827").font("Helvetica").fontSize(9).text(label, 106, y, { width: 290, continued: false });
    // Amount (right-aligned)
    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .text(chf(amount), 400, y, { width: 144, align: "right", continued: false });
    if (doc.y < y + 13) doc.y = y + 14;
    doc.fillColor("#000000");
    doc.moveDown(0.15);
  }

  function caseRowText(caseNum: string, label: string, text: string | undefined) {
    if (!text) return;
    const y = doc.y;
    doc
      .fillColor(BRAND_COLOR)
      .font("Helvetica-Bold")
      .fontSize(9)
      .text(`Case ${caseNum}`, 48, y, { width: 55, continued: false });
    doc.fillColor("#111827").font("Helvetica").fontSize(9).text(`${label} : ${text}`, 106, y, { width: 430, continued: false });
    if (doc.y < y + 13) doc.y = y + 14;
    doc.fillColor("#000000");
    doc.moveDown(0.15);
  }

  // ── 1. Header ──────────────────────────────────────────────────────────────

  // Titre principal
  doc
    .fillColor(BRAND_COLOR)
    .fontSize(18)
    .font("Helvetica-Bold")
    .text(`Certificat de salaire ${input.year}`, 48, 40, { continued: false });

  doc
    .fillColor("#374151")
    .fontSize(9.5)
    .font("Helvetica")
    .text("Formulaire 11 — Lohnausweis / Certificat de salaire", 48, doc.y, { continued: false });

  doc.moveDown(0.3);

  // Boîte bleue subtitle
  const boxY = doc.y;
  doc.rect(48, boxY, 496, 20).fill("#eff6ff");
  doc
    .fillColor(BRAND_COLOR)
    .fontSize(8.5)
    .font("Helvetica-Bold")
    .text("Swissdec Guidelines 5.0 — AFC Suisse", 54, boxY + 5, { continued: false });
  doc.y = boxY + 26;

  hrule(6);

  // ── 2. Identité employeur ─────────────────────────────────────────────────

  sectionHeader("1. Employeur");
  kv("Raison sociale", input.employer.legalName);
  kv("Adresse", input.employer.address);
  if (input.employer.ideNumber) kv("Numéro IDE", input.employer.ideNumber);
  if (input.employer.avsNumber) kv("Numéro AVS employeur", input.employer.avsNumber);

  hrule();

  // ── 3. Identité employé ───────────────────────────────────────────────────

  sectionHeader("2. Employé(e)");
  kv("Nom et prénom", `${input.employee.lastName} ${input.employee.firstName}`);
  if (input.employee.address) kv("Adresse", input.employee.address);
  if (input.employee.avsNumber) kv("Numéro AVS", input.employee.avsNumber);

  hrule();

  // ── 4. Période ────────────────────────────────────────────────────────────

  sectionHeader("3. Période d'emploi");
  kv("Début", input.period.start);
  kv("Fin", input.period.end);
  kv("Année fiscale", String(input.year));

  hrule();

  // ── 5. Cases Swissdec 1-15 ────────────────────────────────────────────────

  sectionHeader("4. Rémunération — Cases Swissdec (Lohnausweis)");
  doc.moveDown(0.3);

  const c = input.cases;

  caseRow("1", "Salaire annuel brut soumis AVS", c.case1_salaireBrut);
  caseRow("7", "Autres prestations (13ème, bonus, gratifications)", c.case7_autresPrestations);
  caseRow("8", "Total salaire brut", c.case8_totalBrut);

  // Separator entre salaires et déductions
  doc.moveDown(0.2);
  doc
    .fillColor("#6b7280")
    .fontSize(8)
    .font("Helvetica-Oblique")
    .text("Déductions employé :", 48, doc.y);
  doc.moveDown(0.2);
  doc.fillColor("#000000").font("Helvetica");

  caseRow("9", "Cotisations AVS/AI/APG/AC (part employé)", c.case9_cotisationsSociales);
  caseRow("10", "Cotisations LPP ordinaires (part employé)", c.case10_lppOrdinaire);
  caseRow("11", "Rachats LPP volontaires", c.case11_lppRachats);
  caseRow("12", "Autres déductions", c.case12_autresDeductions);

  // Separator frais et autres
  doc.moveDown(0.2);
  doc
    .fillColor("#6b7280")
    .fontSize(8)
    .font("Helvetica-Oblique")
    .text("Frais et prestations diverses :", 48, doc.y);
  doc.moveDown(0.2);
  doc.fillColor("#000000").font("Helvetica");

  caseRow("13", "Frais effectifs remboursés", c.case13_fraisEffectifs);
  caseRow("14", "Prestations non soumises AVS", c.case14_prestationsNonSoumises);
  caseRowText("15", "Remarques", c.case15_remarques);

  // Total calculé (si données suffisantes)
  const totalDeductions =
    (c.case9_cotisationsSociales ?? 0) +
    (c.case10_lppOrdinaire ?? 0) +
    (c.case11_lppRachats ?? 0) +
    (c.case12_autresDeductions ?? 0);

  const netSalary = c.case8_totalBrut - totalDeductions;

  doc.moveDown(0.4);
  // Ligne de total net
  doc.rect(48, doc.y, 496, 22).fill("#f0fdf4");
  const netY = doc.y + 5;
  doc
    .fillColor("#166534")
    .font("Helvetica-Bold")
    .fontSize(10)
    .text("Salaire net estimé (brut − déductions cases 9-12) :", 54, netY, { width: 336, continued: false });
  doc.fillColor("#166534").font("Helvetica-Bold").fontSize(10).text(chf(netSalary), 400, netY, { width: 144, align: "right", continued: false });
  doc.y = netY + 26;
  doc.fillColor("#000000");

  hrule();

  // ── 6. Disclaimer ─────────────────────────────────────────────────────────

  doc.moveDown(0.3);
  doc.rect(48, doc.y, 496, 36).fill("#fef3c7");
  const discY = doc.y + 5;
  doc
    .fillColor("#92400e")
    .fontSize(8.5)
    .font("Helvetica-Bold")
    .text("AVERTISSEMENT", 54, discY, { continued: false });
  doc
    .font("Helvetica")
    .fontSize(8)
    .text(DISCLAIMER, 54, discY + 12, { width: 484, continued: false });
  doc.y = discY + 40;
  doc.fillColor("#000000");

  // ── 7. Citation légale ────────────────────────────────────────────────────

  doc.moveDown(0.5);
  doc
    .fillColor("#374151")
    .fontSize(8)
    .font("Helvetica-Oblique")
    .text(`Base légale : ${LEGAL_CITATION}`, 48, doc.y, { continued: false });

  doc.moveDown(0.3);
  doc
    .fillColor("#9ca3af")
    .fontSize(7.5)
    .font("Helvetica")
    .text(`Généré par Lexa · ${new Date().toLocaleDateString("fr-CH")} · Ce document n'est pas un formulaire officiel AFC`, 48, doc.y, { continued: false });

  doc.end();
  return done;
}

// ── Export principal ──────────────────────────────────────────────────────────

export type CertificateOutput = {
  pdfBase64: string;
  structuredData: {
    formId: string;
    year: number;
    employer: CertificateInputType["employer"];
    employee: CertificateInputType["employee"];
    period: CertificateInputType["period"];
    cases: CertificateInputType["cases"];
    computedNetSalary: number;
  };
  citations: Array<{ law: string; article: string; text: string }>;
  generatedAt: string;
};

export async function buildSwissdecCertificate(
  input: CertificateInputType,
): Promise<CertificateOutput> {
  const pdfBuffer = await renderCertificatePdf(input);

  const c = input.cases;
  const totalDeductions =
    (c.case9_cotisationsSociales ?? 0) +
    (c.case10_lppOrdinaire ?? 0) +
    (c.case11_lppRachats ?? 0) +
    (c.case12_autresDeductions ?? 0);
  const computedNetSalary = c.case8_totalBrut - totalDeductions;

  return {
    pdfBase64: pdfBuffer.toString("base64"),
    structuredData: {
      formId: "swissdec-lohnausweis-form11",
      year: input.year,
      employer: input.employer,
      employee: input.employee,
      period: input.period,
      cases: input.cases,
      computedNetSalary,
    },
    citations: [
      {
        law: "LIFD",
        article: "127",
        text: "LIFD art. 127 al. 1 lit. a — obligation de certificat de salaire pour l'employeur.",
      },
      {
        law: "Swissdec-Guidelines",
        article: "Form-11",
        text: "Swissdec Guidelines 5.0 — Lohnausweis Form 11, cases 1-15 normalisées.",
      },
    ],
    generatedAt: new Date().toISOString(),
  };
}
