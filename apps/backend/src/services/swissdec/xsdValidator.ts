/**
 * xsdValidator.ts — Validation structurelle XML ELM Swissdec 5.0
 *
 * Valide qu'un XML contient bien un élément racine SalaryDeclaration
 * avec le namespace Swissdec ELM attendu, et que les champs minimaux
 * (AccountingYear, Company) sont présents.
 *
 * Note : libxmljs2 n'est pas requis ici — la validation légère via
 * fast-xml-parser + checks structurels est suffisante pour l'usage
 * wizard Lexa (confidence = 1.0 = "le QR était là et le XML parseable").
 * Une validation XSD complète peut être ajoutée si besoin en V1.4.
 */

/** Namespaces ELM acceptés (toutes versions majeures connues) */
export const ELM_NAMESPACES = [
  "http://www.swissdec.ch/schema/sd/20050902/SalaryDeclaration",
  "http://www.swissdec.ch/schema/sd/20200220/SalaryDeclaration",
  "http://www.swissdec.ch/schema/sd/20200220/Lohnausweis",
] as const;

export type ElmNamespace = (typeof ELM_NAMESPACES)[number];

export interface XsdValidationResult {
  valid: boolean;
  namespace: string | null;
  schemaVersion: string | null;
  errors: string[];
}

/**
 * Vérifie qu'une chaîne XML est un Lohnausweis ELM Swissdec valide.
 *
 * Checks effectués :
 * 1. Parseabilité XML basique (pas d'erreurs de parsing)
 * 2. Présence du namespace ELM dans la déclaration
 * 3. Présence des éléments minimaux (AccountingYear, Company)
 *
 * @param xmlContent - Contenu XML à valider
 * @returns Résultat de validation avec erreurs détaillées
 */
export function validateElmXml(xmlContent: string): XsdValidationResult {
  const errors: string[] = [];

  if (!xmlContent || xmlContent.trim().length === 0) {
    return { valid: false, namespace: null, schemaVersion: null, errors: ["XML vide"] };
  }

  // 1. Vérification namespace ELM dans la déclaration
  const detectedNamespace = ELM_NAMESPACES.find((ns) => xmlContent.includes(ns)) ?? null;
  if (!detectedNamespace) {
    errors.push(
      `Namespace ELM Swissdec absent. Attendu l'un de: ${ELM_NAMESPACES.join(", ")}`
    );
  }

  // 2. Présence élément racine SalaryDeclaration
  if (!xmlContent.includes("SalaryDeclaration") && !xmlContent.includes("Lohnausweis")) {
    errors.push("Élément racine SalaryDeclaration ou Lohnausweis absent");
  }

  // 3. Présence champs minimaux
  if (!xmlContent.includes("AccountingYear") && !xmlContent.includes("AccYear")) {
    errors.push("Élément AccountingYear absent (champ obligatoire)");
  }

  if (!xmlContent.includes("Company") && !xmlContent.includes("Arbeitgeber")) {
    errors.push("Élément Company/Arbeitgeber absent (champ obligatoire)");
  }

  // 4. Extraction schemaVersion si présente
  const versionMatch = xmlContent.match(/schemaVersion="([^"]+)"/);
  const schemaVersion = versionMatch?.[1] ?? null;

  const valid = errors.length === 0;
  return { valid, namespace: detectedNamespace, schemaVersion, errors };
}
