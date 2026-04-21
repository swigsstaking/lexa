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
 * Décompte TVA au format eCH-0217.
 *
 * Couvre l'intégralité des sections du standard :
 *   - En-tête entreprise + période
 *   - CA imposable par taux (8.1%, 2.6%, 3.8%)
 *   - Acquisitions depuis l'étranger (art. 45 LTVA)
 *   - Prestations à soi-même (art. 31 LTVA)
 *   - CA exonéré — exportations (art. 19 LTVA)
 *   - Impôt préalable (operating + capex)
 *   - Corrections double usage (art. 30 LTVA)
 *   - Réductions impôt préalable (cadeaux >500 CHF, repas d'affaires, etc.)
 *   - Corrections périodes antérieures
 *   - Récapitulatif : totalTaxDue, totalInputTax, netTaxPayable
 *   - Disclaimer IA (whitepaper §6)
 *
 * Les champs non renseignés dans la projection sont valorisés à 0
 * conformément au schéma eCH-0217.
 *
 * Marqué "draft" via l'attribut status pour éviter toute confusion
 * avec un dépôt officiel AFC.
 */
export function renderDecompteTvaXml(form: FilledForm): string {
  const c = form.company;
  const p = form.period;
  const proj = form.projection;

  // ── Champs optionnels — fallback à 0 si absent dans la projection ───────────
  // Ces champs seront alimentés quand le wizard TVA les collectera (session 14+).
  const acquisitionsTaxAmount: number =
    (proj as Record<string, unknown>)["acquisitionsTaxAmount"] as number ?? 0;
  const selfSupplyTaxAmount: number =
    (proj as Record<string, unknown>)["selfSupplyTaxAmount"] as number ?? 0;
  const correctionDoubleUsage: number =
    (proj as Record<string, unknown>)["correctionDoubleUsage"] as number ?? 0;
  const inputTaxReduction: number =
    (proj as Record<string, unknown>)["inputTaxReduction"] as number ?? 0;
  const inputTaxPriorPeriod: number =
    (proj as Record<string, unknown>)["inputTaxPriorPeriod"] as number ?? 0;
  const revenueExempted: number = proj.caExonere ?? 0;

  // ── Récapitulatif ────────────────────────────────────────────────────────────
  // totalTaxDue = TVA collectée sur CA imposable + acquisitions + self-supply
  const totalTaxDue =
    proj.tvaDue.total + acquisitionsTaxAmount + selfSupplyTaxAmount;

  // totalInputTax = impôt préalable total – corrections double usage
  //                – réductions – corrections périodes antérieures
  const totalInputTax = Math.max(
    0,
    proj.impotPrealable.total -
      correctionDoubleUsage -
      inputTaxReduction -
      inputTaxPriorPeriod,
  );

  // netTaxPayable > 0 → à payer à l'AFC ; < 0 → remboursé par l'AFC
  const netTaxPayable = totalTaxDue - totalInputTax;

  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    `<VATDeclaration xmlns="http://www.ech.ch/xmlns/eCH-0217/1" ` +
      `version="1.0" ` +
      `status="draft" ` +
      `kind="${p.kind}" ` +
      `generatedBy="Lexa" ` +
      `generatedAt="${form.generatedAt}">`,
  );

  // ── Entreprise ───────────────────────────────────────────────────────────────
  lines.push("  <enterprise>");
  lines.push(`    <uid>${escapeXml(c.uid ?? "")}</uid>`);
  lines.push(`    <name>${escapeXml(c.name)}</name>`);
  lines.push(`    <vatNumber>${escapeXml(c.vatNumber ?? "")}</vatNumber>`);
  lines.push(`    <canton>${escapeXml(c.canton ?? "")}</canton>`);
  lines.push(`    <legalForm>${escapeXml(c.legalForm)}</legalForm>`);
  lines.push("  </enterprise>");

  // ── Période ──────────────────────────────────────────────────────────────────
  lines.push("  <period>");
  lines.push(`    <kind>${p.kind}</kind>`);
  lines.push(`    <year>${p.year}</year>`);
  if (p.kind === "quarterly") {
    lines.push(`    <quarter>${p.quarter}</quarter>`);
  }
  lines.push(`    <start>${p.start}</start>`);
  lines.push(`    <end>${p.end}</end>`);
  lines.push(`    <method>${form.method}</method>`);
  lines.push("  </period>");

  // ── Chiffre d'affaires imposable par taux ────────────────────────────────────
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

  // ── CA exonéré — exportations (art. 19 LTVA) ─────────────────────────────────
  lines.push("  <exemptTurnover>");
  lines.push(`    <revenueExempted>${num(revenueExempted)}</revenueExempted>`);
  lines.push(
    `    <legalBasis>${escapeXml("art. 19 LTVA — exportations et opérations assimilées")}</legalBasis>`,
  );
  lines.push("  </exemptTurnover>");

  // ── Acquisitions depuis l'étranger (art. 45 LTVA) ───────────────────────────
  lines.push("  <acquisitions>");
  lines.push(
    `    <acquisitionsTaxAmount>${num(acquisitionsTaxAmount)}</acquisitionsTaxAmount>`,
  );
  lines.push(
    `    <legalBasis>${escapeXml("art. 45 LTVA — acquisition de prestations de services et de biens de fournisseurs étrangers")}</legalBasis>`,
  );
  lines.push("  </acquisitions>");

  // ── Prestations à soi-même (art. 31 LTVA) ───────────────────────────────────
  lines.push("  <selfSupply>");
  lines.push(
    `    <selfSupplyTaxAmount>${num(selfSupplyTaxAmount)}</selfSupplyTaxAmount>`,
  );
  lines.push(
    `    <legalBasis>${escapeXml("art. 31 LTVA — prestations à soi-même")}</legalBasis>`,
  );
  lines.push("  </selfSupply>");

  // ── Impôt préalable ──────────────────────────────────────────────────────────
  lines.push("  <inputTax>");
  lines.push(
    `    <operatingExpenses>${num(proj.impotPrealable.operating)}</operatingExpenses>`,
  );
  lines.push(
    `    <capitalExpenditure>${num(proj.impotPrealable.capex)}</capitalExpenditure>`,
  );
  lines.push(`    <total>${num(proj.impotPrealable.total)}</total>`);
  lines.push("  </inputTax>");

  // ── Corrections double usage (art. 30 LTVA) ──────────────────────────────────
  lines.push("  <corrections>");
  lines.push(
    `    <correctionDoubleUsage>${num(correctionDoubleUsage)}</correctionDoubleUsage>`,
  );
  lines.push(
    `    <legalBasis>${escapeXml("art. 30 LTVA — correction de la déduction de l'impôt préalable")}</legalBasis>`,
  );
  lines.push("  </corrections>");

  // ── Réductions de la déduction (cadeaux >500 CHF, repas, etc.) ───────────────
  lines.push("  <reductions>");
  lines.push(
    `    <inputTaxReduction>${num(inputTaxReduction)}</inputTaxReduction>`,
  );
  lines.push(
    `    <note>${escapeXml("Cadeaux >500 CHF, repas d'affaires, parts privées non déductibles")}</note>`,
  );
  lines.push("  </reductions>");

  // ── Corrections périodes antérieures ─────────────────────────────────────────
  lines.push("  <adjustments>");
  lines.push(
    `    <inputTaxPriorPeriod>${num(inputTaxPriorPeriod)}</inputTaxPriorPeriod>`,
  );
  lines.push(
    `    <note>${escapeXml("Corrections et rectifications concernant des périodes fiscales antérieures")}</note>`,
  );
  lines.push("  </adjustments>");

  // ── Récapitulatif ─────────────────────────────────────────────────────────────
  // Formule officielle eCH-0217 :
  //   totalTaxDue      = TVA collectée + acquisitions + self-supply
  //   totalInputTax    = impôt préalable net (après corrections)
  //   netTaxPayable    = totalTaxDue − totalInputTax
  lines.push("  <summary>");
  lines.push(`    <totalTaxDue>${num(totalTaxDue)}</totalTaxDue>`);
  lines.push(`    <totalInputTax>${num(totalInputTax)}</totalInputTax>`);
  lines.push(`    <netTaxPayable>${num(netTaxPayable)}</netTaxPayable>`);
  lines.push(
    `    <direction>${netTaxPayable >= 0 ? "toAuthority" : "fromAuthority"}</direction>`,
  );
  lines.push("  </summary>");

  // ── Solde (rétro-compatibilité — duplique <summary> pour les consommateurs
  //    qui lisaient l'ancienne structure) ────────────────────────────────────────
  lines.push("  <balance>");
  lines.push(`    <amountDue>${num(proj.solde)}</amountDue>`);
  lines.push(
    `    <direction>${proj.solde >= 0 ? "toAuthority" : "fromAuthority"}</direction>`,
  );
  lines.push("  </balance>");

  // ── Disclaimer IA (whitepaper §6) ────────────────────────────────────────────
  lines.push("  <disclaimer>");
  lines.push(`    <liability>preparation_only</liability>`);
  lines.push(
    `    <note>${escapeXml(form.template.output.pdf.disclaimer.trim())}</note>`,
  );
  lines.push("  </disclaimer>");

  lines.push("</VATDeclaration>");
  return lines.join("\n");
}
