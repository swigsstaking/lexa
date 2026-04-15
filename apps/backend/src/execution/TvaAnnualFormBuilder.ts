import { getCompany, loadTemplate, projectTva } from "./shared.js";
import type { FilledForm } from "./types.js";
import { annualRange } from "./types.js";

const TEMPLATE_FILE = "tva-afc-decompte-annuel-2024.yaml";

/**
 * Décompte TVA annuel récapitulatif (LTVA art. 72).
 *
 * En v1 : consolide tous les events TransactionClassified de l'année
 * complète sur la projection unique, sans détail par trimestre. Les
 * corrections post-périodes (art. 72 al. 1) ne sont pas encore distinguées
 * et seront ajoutées en session 14+ via un event dédié
 * `TvaCorrectionDeclared`.
 */
export async function buildDecompteTvaAnnual(params: {
  tenantId: string;
  year: number;
  method?: "effective" | "tdfn";
}): Promise<FilledForm> {
  const { tenantId, year, method = "effective" } = params;
  const template = await loadTemplate(TEMPLATE_FILE);
  const company = await getCompany(tenantId);
  const { start, end } = annualRange(year);
  const projection = await projectTva(tenantId, start, end);

  return {
    formId: template.form_id,
    version: template.version,
    method,
    period: { kind: "annual", year, start, end },
    company,
    projection,
    template,
    generatedAt: new Date().toISOString(),
  };
}
