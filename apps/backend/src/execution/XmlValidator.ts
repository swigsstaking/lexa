/**
 * Validation structurelle légère des XML eCH-0119 / eCH-0229 / eCH-0217.
 *
 * Pas de dépendance externe (pas de libxmljs / xpath / xmldom).
 * Vérifications effectuées :
 *   1. Présence du namespace correct
 *   2. Présence des éléments obligatoires (regex sur les balises)
 *   3. Valeurs numériques non-vides pour les totaux critiques
 *
 * Ces vérifications suffisent à détecter une génération tronquée ou un bug
 * de template. La validation XSD complète reste à charge de l'AFC au dépôt.
 */

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Vérifie que toutes les balises obligatoires sont présentes dans le XML.
 * Format attendu : <tagName> ou <tagName attr="...">
 */
function checkRequiredTags(xml: string, tags: string[]): string[] {
  const errors: string[] = [];
  for (const tag of tags) {
    // Accepte <tag> et <tag attribut=...>
    const pattern = new RegExp(`<${tag}[\\s>]`);
    if (!pattern.test(xml)) {
      errors.push(`Élément obligatoire manquant : <${tag}>`);
    }
  }
  return errors;
}

/**
 * Vérifie que les balises numériques contiennent une valeur non vide.
 * Accepte les nombres positifs, négatifs et les décimales.
 */
function checkNumericTags(xml: string, tags: string[]): string[] {
  const errors: string[] = [];
  for (const tag of tags) {
    // Capture le contenu entre <tag> et </tag> — doit être un nombre
    const pattern = new RegExp(`<${tag}>([^<]*)</${tag}>`);
    const match = pattern.exec(xml);
    if (!match) {
      errors.push(`Balise numérique absente ou mal formée : <${tag}>`);
      continue;
    }
    const value = match[1].trim();
    if (value === "" || isNaN(Number(value))) {
      errors.push(`Valeur numérique invalide dans <${tag}> : "${value}"`);
    }
  }
  return errors;
}

/**
 * Vérifie la présence du namespace XML déclaré dans l'élément racine.
 */
function checkNamespace(xml: string, expectedNs: string): string[] {
  if (!xml.includes(expectedNs)) {
    return [`Namespace manquant : ${expectedNs}`];
  }
  return [];
}

// ── Validateurs publics ───────────────────────────────────────────────────────

export interface XmlValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Valide un XML eCH-0119 (déclaration fiscale PP).
 *
 * Éléments obligatoires vérifiés :
 *   - namespace eCH-0119/4
 *   - header > taxPeriod, canton, source
 *   - content > mainForm > personDataPartner1
 *   - revenueCalculation > totalAmountNetRevenue
 */
export function validateEch0119(xmlString: string): XmlValidationResult {
  const errors: string[] = [
    ...checkNamespace(xmlString, "http://www.ech.ch/xmlns/eCH-0119/4"),
    ...checkRequiredTags(xmlString, [
      "header",
      "taxPeriod",
      "canton",
      "source",
      "content",
      "mainForm",
      "personDataPartner1",
      "revenueCalculation",
      "totalAmountNetRevenue",
    ]),
  ];

  return { valid: errors.length === 0, errors };
}

/**
 * Valide un XML eCH-0229 (déclaration fiscale PM).
 *
 * Éléments obligatoires vérifiés :
 *   - namespace eCH-0229/1
 *   - header > taxPeriod, canton, source
 *   - legalEntityData
 *   - benefitDeclaration > beneficeImposable
 */
export function validateEch0229(xmlString: string): XmlValidationResult {
  const errors: string[] = [
    ...checkNamespace(xmlString, "http://www.ech.ch/xmlns/eCH-0229/1"),
    ...checkRequiredTags(xmlString, [
      "header",
      "taxPeriod",
      "canton",
      "source",
      "legalEntityData",
      "benefitDeclaration",
      "beneficeImposable",
    ]),
    ...checkNumericTags(xmlString, [
      "beneficeImposable",
    ]),
  ];

  return { valid: errors.length === 0, errors };
}

/**
 * Valide un XML eCH-0217 (décompte TVA AFC).
 *
 * Éléments obligatoires vérifiés :
 *   - namespace eCH-0217/1
 *   - enterprise > uid, name, vatNumber
 *   - period > kind, year, start, end, method
 *   - taxableTurnover > totalVatDue
 *   - inputTax > total
 *   - summary > totalTaxDue, totalInputTax, netTaxPayable
 *   - balance > amountDue
 */
export function validateEch0217(xmlString: string): XmlValidationResult {
  const errors: string[] = [
    ...checkNamespace(xmlString, "http://www.ech.ch/xmlns/eCH-0217/1"),
    ...checkRequiredTags(xmlString, [
      "enterprise",
      "uid",
      "name",
      "vatNumber",
      "period",
      "kind",
      "year",
      "start",
      "end",
      "method",
      "taxableTurnover",
      "totalVatDue",
      "inputTax",
      "acquisitions",
      "acquisitionsTaxAmount",
      "selfSupply",
      "selfSupplyTaxAmount",
      "exemptTurnover",
      "revenueExempted",
      "corrections",
      "correctionDoubleUsage",
      "reductions",
      "inputTaxReduction",
      "adjustments",
      "inputTaxPriorPeriod",
      "summary",
      "totalTaxDue",
      "totalInputTax",
      "netTaxPayable",
      "balance",
      "amountDue",
    ]),
    ...checkNumericTags(xmlString, [
      "totalVatDue",
      "totalTaxDue",
      "totalInputTax",
      "netTaxPayable",
      "amountDue",
    ]),
  ];

  return { valid: errors.length === 0, errors };
}
