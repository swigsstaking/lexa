/**
 * OCR prompts par catégorie de document fiscal suisse.
 * Utilisés par le pipeline OCR pp-import (P1.B.B1).
 *
 * Paramètres Ollama obligatoires (spec §6.2 + mémoire feedback_ia_perf_measurement.md) :
 *   think: false, num_predict: 8192, temperature: 0
 */

export type ImportCategory =
  | "salary"
  | "wealth"
  | "investment"
  | "expense"
  | "insurance"
  | "auto";

/**
 * Prompt classifier vision — catégorie "auto" (drag & drop universel)
 * Retourne un JSON minimaliste pour la classification rapide.
 */
export const CLASSIFIER_PROMPT = `Quel type de document fiscal suisse est-ce ? Réponds en JSON valide uniquement, sans markdown ni commentaire :
{"type": "salary_certificate" | "bank_statement" | "investment" | "expense" | "insurance" | "unknown", "confidence": 0.0-1.0}`;

/**
 * Map classifier output → ImportCategory interne
 */
export const CLASSIFIER_TYPE_MAP: Record<string, ImportCategory> = {
  salary_certificate: "salary",
  bank_statement: "wealth",
  investment: "investment",
  expense: "expense",
  insurance: "insurance",
  unknown: "auto",
};

/**
 * Prompt extraction certificat de salaire (Swissdec ELM)
 */
export const SALARY_PROMPT = `Tu es un assistant OCR spécialisé dans les certificats de salaire suisses (Swissdec ELM).
Extrais les champs suivants depuis l'image. Retourne UNIQUEMENT du JSON valide, sans markdown ni commentaire.

{
  "employer_name": string,
  "employer_uid": string | null,
  "employee_name": string,
  "year": number,
  "gross_annual_salary": number,
  "thirteenth_salary": number | null,
  "bonus": number | null,
  "ahv_ai_apg": number,
  "lpp_employee": number,
  "alv_employee": number | null,
  "professional_expenses": number | null,
  "other_income": number | null,
  "confidence": number
}

Si un champ est absent ou illisible, mets null. Inclure une confiance globale entre 0.0 et 1.0 dans le champ "confidence".`;

/**
 * Prompt extraction relevé bancaire / fortune
 */
export const WEALTH_PROMPT = `Tu es un assistant OCR spécialisé dans les relevés bancaires suisses.
Extrais les champs suivants depuis l'image. Retourne UNIQUEMENT du JSON valide, sans markdown ni commentaire.

{
  "bank_name": string,
  "iban": string | null,
  "account_holder": string | null,
  "period": string,
  "closing_balance": number,
  "currency": string,
  "year": number | null,
  "confidence": number
}

Si un champ est absent ou illisible, mets null. Inclure une confiance globale entre 0.0 et 1.0 dans le champ "confidence".`;

/**
 * Prompt extraction document de placements / titres
 */
export const INVESTMENT_PROMPT = `Tu es un assistant OCR spécialisé dans les documents de placements financiers suisses.
Extrais les champs suivants depuis l'image. Retourne UNIQUEMENT du JSON valide, sans markdown ni commentaire.

{
  "institution": string,
  "account_holder": string | null,
  "period": string | null,
  "year": number | null,
  "total_value_chf": number,
  "holdings": [{"name": string, "value_chf": number, "quantity": number | null}] | null,
  "currency": string,
  "confidence": number
}

Si un champ est absent ou illisible, mets null. Inclure une confiance globale entre 0.0 et 1.0 dans le champ "confidence".`;

/**
 * Prompt extraction frais déductibles (factures, notes de frais)
 */
export const EXPENSE_PROMPT = `Tu es un assistant OCR spécialisé dans les factures et notes de frais suisses.
Extrais les champs suivants depuis l'image. Retourne UNIQUEMENT du JSON valide, sans markdown ni commentaire.

{
  "vendor": string,
  "date": string | null,
  "amount_ttc": number,
  "amount_ht": number | null,
  "tva": number | null,
  "tva_rate": number | null,
  "description": string | null,
  "category_hint": "transport" | "restaurant" | "office" | "medical" | "other" | null,
  "confidence": number
}

Si un champ est absent ou illisible, mets null. Inclure une confiance globale entre 0.0 et 1.0 dans le champ "confidence".`;

/**
 * Prompt extraction documents d'assurance (3a, maladie, vie)
 */
export const INSURANCE_PROMPT = `Tu es un assistant OCR spécialisé dans les documents d'assurance suisses (pilier 3a, maladie, vie).
Extrais les champs suivants depuis l'image. Retourne UNIQUEMENT du JSON valide, sans markdown ni commentaire.

{
  "insurance_company": string,
  "policy_holder": string | null,
  "policy_number": string | null,
  "insurance_type": "3a" | "health" | "life" | "other" | null,
  "year": number | null,
  "annual_premium": number | null,
  "insured_amount": number | null,
  "period_start": string | null,
  "period_end": string | null,
  "confidence": number
}

Si un champ est absent ou illisible, mets null. Inclure une confiance globale entre 0.0 et 1.0 dans le champ "confidence".`;

/**
 * Retourne le prompt correspondant à la catégorie.
 */
export function getPromptForCategory(category: ImportCategory): string {
  switch (category) {
    case "salary":
      return SALARY_PROMPT;
    case "wealth":
      return WEALTH_PROMPT;
    case "investment":
      return INVESTMENT_PROMPT;
    case "expense":
      return EXPENSE_PROMPT;
    case "insurance":
      return INSURANCE_PROMPT;
    case "auto":
      return SALARY_PROMPT; // fallback générique si jamais appelé sur "auto"
  }
}

/**
 * Retourne la wizard step cible selon la catégorie.
 */
export function categoryToWizardStep(category: ImportCategory): string {
  switch (category) {
    case "salary":
      return "Step2Revenues";
    case "wealth":
    case "investment":
      return "Step3Wealth";
    case "expense":
    case "insurance":
      return "Step4Deductions";
    case "auto":
      return "Step2Revenues"; // sera overridé après classification
  }
}
