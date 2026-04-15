import PDFDocument from "pdfkit";
import type { FilledVsPpForm } from "./types.js";

function chf(n: number): string {
  return n.toLocaleString("fr-CH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export async function renderVsPpPdf(form: FilledVsPpForm): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 48, bottom: 48, left: 48, right: 48 },
    info: {
      Title: `Déclaration PP VS ${form.year} — ${form.company.name}`,
      Author: "Lexa",
      Subject: "Déclaration fiscale PP Canton du Valais",
    },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  // ── Header ─────────────────────────────────────────
  doc.fontSize(18).fillColor("#0b0b0f").text("Déclaration d'impôt PP", {
    align: "left",
  });
  doc.fontSize(10).fillColor("#71717a").text("Canton du Valais — Service cantonal des contributions");
  doc
    .fontSize(9)
    .text(
      `${form.template.legal_reference.law} ${form.template.legal_reference.rs} — art. ${form.template.legal_reference.articles.join(", ")}`,
    );
  doc.moveDown(1);

  // ── Disclaimer ────────────────────────────────────
  doc.rect(doc.x, doc.y, 500, 56).fillAndStroke("#fef2f2", "#ef4444");
  doc
    .fillColor("#991b1b")
    .fontSize(8)
    .text(form.template.output.pdf.disclaimer.trim(), doc.x + 8, doc.y + 8, {
      width: 484,
    });
  doc.moveDown(4);
  doc.x = 48;

  // ── Contribuable ───────────────────────────────────
  doc.fillColor("#0b0b0f").fontSize(11).text("Contribuable", { underline: true });
  doc.moveDown(0.3);
  doc.fontSize(10);
  doc.text(`Nom : ${form.company.name}`);
  doc.text(`UID / numéro fiscal : ${form.company.uid ?? "—"}`);
  doc.text(`Canton : ${form.company.canton ?? "VS"}`);
  doc.text(`Année fiscale : ${form.year}`);
  doc.moveDown(0.8);

  // ── Revenus ────────────────────────────────────────
  doc.fontSize(11).text("Revenus", { underline: true });
  doc.moveDown(0.3);
  doc.fontSize(10);

  const colX = { label: 48, val: 430 };
  const row = (label: string, value: number, bold = false) => {
    const y = doc.y;
    if (bold) doc.font("Helvetica-Bold");
    doc.text(label, colX.label, y);
    doc.text(chf(value), colX.val, y, { width: 110, align: "right" });
    if (bold) doc.font("Helvetica");
    doc.moveDown(0.4);
  };

  row("Revenu net d'activité indépendante", form.projection.revenuIndependant);
  row("Revenu d'activité dépendante (TODO : saisir manuellement)", 0);
  row("Revenus du capital (TODO : saisir manuellement)", 0);
  doc.strokeColor("#e5e7eb").moveTo(48, doc.y + 2).lineTo(540, doc.y + 2).stroke();
  doc.moveDown(0.5);
  row("Total des revenus", form.projection.revenuTotal, true);
  doc.moveDown(0.6);

  // ── Fortune ────────────────────────────────────────
  doc.fontSize(11).text("Fortune", { underline: true });
  doc.moveDown(0.3);
  doc.fontSize(10);
  row("Fortune nette au 31 décembre", form.projection.fortuneNette, true);
  doc.moveDown(0.6);

  // ── Déductions ─────────────────────────────────────
  doc.fontSize(11).text("Déductions", { underline: true });
  doc.moveDown(0.3);
  doc.fontSize(10);
  const ref = form.template.reference_amounts;
  row(
    `Frais professionnels (forfait ${ref.frais_professionnels_forfait_pct}% min ${chf(ref.frais_professionnels_forfait_min_chf)} / max ${chf(ref.frais_professionnels_forfait_max_chf)})`,
    form.projection.fraisProForfait,
  );
  row(
    `Cotisation pilier 3a (TODO · max ${chf(ref.pilier_3a_independant_max_chf)} indép. / ${chf(ref.pilier_3a_salarie_max_chf)} salarié)`,
    0,
  );
  row("Rachats LPP (TODO)", 0);
  row("Primes d'assurance maladie (TODO)", 0);
  row("Intérêts passifs d'emprunts (TODO)", 0);
  doc.strokeColor("#e5e7eb").moveTo(48, doc.y + 2).lineTo(540, doc.y + 2).stroke();
  doc.moveDown(0.5);
  row("Total des déductions", form.projection.deductionTotal, true);
  doc.moveDown(0.6);

  // ── Revenu imposable ───────────────────────────────
  doc.fontSize(11).text("Revenu imposable", { underline: true });
  doc.moveDown(0.3);
  row("Revenu imposable final", form.projection.revenuImposable, true);
  doc.moveDown(1.5);

  // ── Footer ────────────────────────────────────────
  doc
    .fontSize(8)
    .fillColor("#71717a")
    .text(
      `Généré par Lexa le ${new Date(form.generatedAt).toLocaleString("fr-CH")} · Formulaire ${form.formId} v${form.version} · ${form.projection.eventCount} lignes ledger agrégées`,
      48,
      780,
      { width: 500, align: "center" },
    );

  doc.end();
  return done;
}
