import { getCompany, loadTemplate, projectTva } from "./shared.js";
import type { FilledForm } from "./types.js";
import { quarterRange } from "./types.js";

const TEMPLATE_FILE = "tva-afc-decompte-effectif-2024.yaml";

/**
 * Assemble un FilledForm trimestriel à partir des events TransactionClassified
 * du trimestre demandé. Source canonique du template : 01-knowledge-base/forms/
 */
export async function buildDecompteTva(params: {
  tenantId: string;
  quarter: 1 | 2 | 3 | 4;
  year: number;
  method?: "effective" | "tdfn";
}): Promise<FilledForm> {
  const { tenantId, quarter, year, method = "effective" } = params;
  const template = await loadTemplate(TEMPLATE_FILE);
  const company = await getCompany(tenantId);
  const { start, end } = quarterRange(quarter, year);
  const projection = await projectTva(tenantId, start, end);

  return {
    formId: template.form_id,
    version: template.version,
    method,
    period: { kind: "quarterly", quarter, year, start, end },
    company,
    projection,
    template,
    generatedAt: new Date().toISOString(),
  };
}
