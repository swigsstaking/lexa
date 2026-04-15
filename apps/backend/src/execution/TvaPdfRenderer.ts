import PDFDocument from "pdfkit";
import type { FilledForm } from "./types.js";
import type { TdfnRate } from "./TdfnFormBuilder.js";

function chf(n: number): string {
  return n.toLocaleString("fr-CH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export async function renderDecompteTvaPdf(
  form: FilledForm,
  opts?: { tdfnRate?: TdfnRate },
): Promise<Buffer> {
  const isAnnual = form.period.kind === "annual";
  const isTdfn = form.method === "tdfn";
  const title = isTdfn
    ? `Décompte TVA TDFN ${form.period.year}${isAnnual ? "" : ` Q${(form.period as { quarter: number }).quarter}`} — ${form.company.name}`
    : isAnnual
      ? `Décompte TVA annuel ${form.period.year} — ${form.company.name}`
      : `Décompte TVA ${form.period.year} Q${(form.period as { quarter: number }).quarter} — ${form.company.name}`;

  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 48, bottom: 48, left: 48, right: 48 },
    info: {
      Title: title,
      Author: "Lexa",
      Subject: isTdfn
        ? "Décompte TVA AFC — méthode TDFN (LTVA art. 37)"
        : isAnnual
          ? "Décompte TVA AFC annuel récapitulatif (LTVA art. 72)"
          : "Décompte TVA AFC méthode effective",
    },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  // ── Header ─────────────────────────────────────────
  doc
    .fontSize(18)
    .fillColor("#0b0b0f")
    .text(
      isTdfn
        ? "Décompte TVA — méthode TDFN"
        : isAnnual
          ? "Décompte TVA annuel récapitulatif"
          : "Décompte TVA — méthode effective",
      { align: "left" },
    );
  doc
    .fontSize(10)
    .fillColor("#71717a")
    .text("Administration fédérale des contributions (AFC)");
  doc
    .fontSize(9)
    .text(
      `${form.template.legal_reference.law} ${form.template.legal_reference.rs} — art. ${form.template.legal_reference.articles.join(", ")}`,
    );
  doc.moveDown(1);

  // ── Disclaimer (whitepaper §6, responsabilité phase 1) ──
  doc
    .rect(doc.x, doc.y, 500, 42)
    .fillAndStroke("#fef2f2", "#ef4444");
  doc
    .fillColor("#991b1b")
    .fontSize(9)
    .text(form.template.output.pdf.disclaimer.trim(), doc.x + 8, doc.y + 8, {
      width: 484,
    });
  doc.moveDown(3);
  doc.x = 48;

  // ── Entreprise ─────────────────────────────────────
  doc.fillColor("#0b0b0f").fontSize(11).text("Entreprise", { underline: true });
  doc.moveDown(0.3);
  doc.fontSize(10).fillColor("#0b0b0f");
  doc.text(`Raison sociale : ${form.company.name}`);
  doc.text(`UID : ${form.company.uid ?? "—"}`);
  doc.text(`Numéro TVA : ${form.company.vatNumber ?? "—"}`);
  doc.text(`Canton : ${form.company.canton ?? "—"}`);
  doc.moveDown(0.8);

  // ── Période ────────────────────────────────────────
  doc.fontSize(11).text("Période", { underline: true });
  doc.moveDown(0.3);
  doc.fontSize(10);
  if (form.period.kind === "quarterly") {
    doc.text(
      `Trimestre ${form.period.quarter} — ${form.period.year}  (${form.period.start} → ${form.period.end})`,
    );
  } else {
    doc.text(
      `Année ${form.period.year}  (${form.period.start} → ${form.period.end})`,
    );
  }
  doc.text(`Méthode : ${form.method === "effective" ? "Effective" : "TDFN"}`);
  doc.moveDown(0.8);

  // ── Chiffre d'affaires imposable ──────────────────
  doc.fontSize(11).text("Chiffre d'affaires imposable", { underline: true });
  doc.moveDown(0.3);
  doc.fontSize(10);

  const rows: Array<[string, number, number]> = isTdfn
    ? [
        [
          `Secteur « ${opts?.tdfnRate?.label ?? "—"} » · taux net ${opts?.tdfnRate?.rate ?? "?"}%`,
          form.projection.caTtc.standard,
          form.projection.tvaDue.standard,
        ],
      ]
    : [
        ["Taux normal 8.1%", form.projection.caHt.standard, form.projection.tvaDue.standard],
        ["Taux réduit 2.6%", form.projection.caHt.reduced, form.projection.tvaDue.reduced],
        ["Taux hébergement 3.8%", form.projection.caHt.lodging, form.projection.tvaDue.lodging],
      ];

  const colX = { label: 48, ht: 280, tva: 430 };
  doc
    .fillColor("#71717a")
    .fontSize(9)
    .text("Description", colX.label, doc.y, { continued: false });
  const headY = doc.y - 12;
  doc.text(isTdfn ? "CA TTC (CHF)" : "CA HT (CHF)", colX.ht, headY, {
    width: 140,
    align: "right",
  });
  doc.text(isTdfn ? "Impôt dû (CHF)" : "TVA due (CHF)", colX.tva, headY, {
    width: 110,
    align: "right",
  });
  doc.moveDown(0.6);
  doc
    .strokeColor("#e5e7eb")
    .moveTo(48, doc.y)
    .lineTo(540, doc.y)
    .stroke();
  doc.moveDown(0.4);

  doc.fillColor("#0b0b0f").fontSize(10);
  for (const [label, ht, tva] of rows) {
    const y = doc.y;
    doc.text(label, colX.label, y);
    doc.text(chf(ht), colX.ht, y, { width: 140, align: "right" });
    doc.text(chf(tva), colX.tva, y, { width: 110, align: "right" });
    doc.moveDown(0.4);
  }

  // Total TVA due
  doc
    .strokeColor("#e5e7eb")
    .moveTo(48, doc.y + 2)
    .lineTo(540, doc.y + 2)
    .stroke();
  doc.moveDown(0.6);
  {
    const y = doc.y;
    doc.fillColor("#0b0b0f").fontSize(10).font("Helvetica-Bold");
    doc.text("Total TVA due", colX.label, y);
    doc.text(chf(form.projection.tvaDue.total), colX.tva, y, {
      width: 110,
      align: "right",
    });
    doc.font("Helvetica");
    doc.moveDown(1);
  }

  // ── Impôt préalable ────────────────────────────────
  if (!isTdfn) {
    doc.fontSize(11).text("Impôt préalable", { underline: true });
    doc.moveDown(0.3);
    doc.fontSize(10);
    {
      const y = doc.y;
      doc.text("Matériel et prestations", colX.label, y);
      doc.text(chf(form.projection.impotPrealable.operating), colX.tva, y, {
        width: 110,
        align: "right",
      });
      doc.moveDown(0.4);
    }
    {
      const y = doc.y;
      doc.font("Helvetica-Bold");
      doc.text("Total impôt préalable", colX.label, y);
      doc.text(chf(form.projection.impotPrealable.total), colX.tva, y, {
        width: 110,
        align: "right",
      });
      doc.font("Helvetica");
      doc.moveDown(1);
    }
  } else {
    doc.fontSize(9).fillColor("#71717a");
    doc.text(
      "En méthode TDFN, l'impôt préalable est réputé couvert par le taux " +
        "net forfaitaire (LTVA art. 37). Aucune déduction complémentaire.",
      colX.label,
      doc.y,
      { width: 500 },
    );
    doc.fillColor("#0b0b0f").fontSize(10);
    doc.moveDown(1);
  }

  // ── Solde ─────────────────────────────────────────
  doc.fontSize(11).text("Solde à payer", { underline: true });
  doc.moveDown(0.3);
  {
    const y = doc.y;
    const solde = form.projection.solde;
    const label =
      solde >= 0
        ? "Montant à payer à l'AFC"
        : "Montant à recevoir de l'AFC (crédit)";
    doc.fontSize(11).font("Helvetica-Bold").fillColor("#0b0b0f");
    doc.text(label, colX.label, y);
    doc.text(chf(Math.abs(solde)), colX.tva, y, { width: 110, align: "right" });
    doc.font("Helvetica");
  }
  doc.moveDown(2);

  // ── Footer ────────────────────────────────────────
  doc
    .fontSize(8)
    .fillColor("#71717a")
    .text(
      `Généré par Lexa le ${new Date(form.generatedAt).toLocaleString("fr-CH")} · Formulaire ${form.formId} v${form.version} · ${form.projection.eventCount} écritures agrégées`,
      48,
      780,
      { width: 500, align: "center" },
    );

  doc.end();
  return done;
}
