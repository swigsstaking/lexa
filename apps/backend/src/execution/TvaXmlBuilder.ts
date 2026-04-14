import type { FilledForm } from "./types.js";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function num(n: number): string {
  return n.toFixed(2);
}

/**
 * Décompte TVA au format eCH-0217 — v1 minimal.
 *
 * Ne couvre que les champs critiques (entreprise, période, CA par taux,
 * impôt préalable, solde). Le schéma complet eCH-0217 exige de nombreux
 * blocs additionnels (acquisitions, réductions, prestations à soi-même,
 * exportations…) qui seront ajoutés en session 13+.
 *
 * Marqué explicitement "draft" via l'attribut status pour éviter toute
 * confusion avec un dépôt officiel.
 */
export function renderDecompteTvaXml(form: FilledForm): string {
  const c = form.company;
  const p = form.period;
  const proj = form.projection;

  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    `<VATDeclaration xmlns="http://www.ech.ch/xmlns/eCH-0217/1" ` +
      `version="1.0" ` +
      `status="draft" ` +
      `generatedBy="Lexa" ` +
      `generatedAt="${form.generatedAt}">`,
  );

  // ── Entreprise ─────────────────────────────────────
  lines.push("  <enterprise>");
  lines.push(`    <uid>${escapeXml(c.uid ?? "")}</uid>`);
  lines.push(`    <name>${escapeXml(c.name)}</name>`);
  lines.push(`    <vatNumber>${escapeXml(c.vatNumber ?? "")}</vatNumber>`);
  lines.push(`    <canton>${escapeXml(c.canton ?? "")}</canton>`);
  lines.push(`    <legalForm>${escapeXml(c.legalForm)}</legalForm>`);
  lines.push("  </enterprise>");

  // ── Période ────────────────────────────────────────
  lines.push("  <period>");
  lines.push(`    <year>${p.year}</year>`);
  lines.push(`    <quarter>${p.quarter}</quarter>`);
  lines.push(`    <start>${p.start}</start>`);
  lines.push(`    <end>${p.end}</end>`);
  lines.push(`    <method>${form.method}</method>`);
  lines.push("  </period>");

  // ── Chiffre d'affaires imposable par taux ──────────
  lines.push("  <taxableTurnover>");
  lines.push("    <rate code=\"standard\" percent=\"8.1\">");
  lines.push(`      <netAmount>${num(proj.caHt.standard)}</netAmount>`);
  lines.push(`      <vatDue>${num(proj.tvaDue.standard)}</vatDue>`);
  lines.push("    </rate>");
  lines.push("    <rate code=\"reduced\" percent=\"2.6\">");
  lines.push(`      <netAmount>${num(proj.caHt.reduced)}</netAmount>`);
  lines.push(`      <vatDue>${num(proj.tvaDue.reduced)}</vatDue>`);
  lines.push("    </rate>");
  lines.push("    <rate code=\"lodging\" percent=\"3.8\">");
  lines.push(`      <netAmount>${num(proj.caHt.lodging)}</netAmount>`);
  lines.push(`      <vatDue>${num(proj.tvaDue.lodging)}</vatDue>`);
  lines.push("    </rate>");
  lines.push(`    <totalVatDue>${num(proj.tvaDue.total)}</totalVatDue>`);
  lines.push("  </taxableTurnover>");

  // ── Impôt préalable ────────────────────────────────
  lines.push("  <inputTax>");
  lines.push(
    `    <operatingExpenses>${num(proj.impotPrealable.operating)}</operatingExpenses>`,
  );
  lines.push(
    `    <capitalExpenditure>${num(proj.impotPrealable.capex)}</capitalExpenditure>`,
  );
  lines.push(`    <total>${num(proj.impotPrealable.total)}</total>`);
  lines.push("  </inputTax>");

  // ── Solde ─────────────────────────────────────────
  lines.push("  <balance>");
  lines.push(`    <amountDue>${num(proj.solde)}</amountDue>`);
  lines.push(
    `    <direction>${proj.solde >= 0 ? "toAuthority" : "fromAuthority"}</direction>`,
  );
  lines.push("  </balance>");

  // ── Disclaimer IA (whitepaper §6) ──────────────────
  lines.push("  <disclaimer>");
  lines.push(`    <liability>preparation_only</liability>`);
  lines.push(
    `    <note>${escapeXml(form.template.output.pdf.disclaimer.trim())}</note>`,
  );
  lines.push("  </disclaimer>");

  // TODO session 13+ : acquisitions, reductions, selfSupply, exports,
  // tax-exempt turnover, corrections, prior period adjustments.

  lines.push("</VATDeclaration>");
  return lines.join("\n");
}
