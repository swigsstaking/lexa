/**
 * PmFormBuilder V1 — Déclaration fiscale PM Valais
 * Session 26
 *
 * Construit la structure de données d'une déclaration fiscale PM (Sàrl/SA).
 * V1 : calcul structurel + estimation fiscale. Pas de rendu PDF (session 27+).
 *
 * Sources légales :
 *   - LIFD art. 58 : détermination du bénéfice net imposable
 *   - LIFD art. 68 : IFD 8.5% sur bénéfice net
 *   - CO art. 958  : principes comptables (image fidèle)
 *   - LHID art. 24 : harmonisation cantonale PM
 */

import { estimatePmTaxDue, type PmTaxEstimate } from "./pmTaxEstimator.js";

export type PmCompany = {
  legalName: string;
  legalForm: "sarl" | "sa";
  ideNumber?: string;      // CHE-xxx.xxx.xxx
  canton: string;
  commune?: string;
  registeredOffice?: string;
};

export type PmFinancials = {
  benefitAccounting: number;  // bénéfice comptable avant corrections
  corrections: number;        // corrections fiscales (+ = charges non admises, - = déductions)
  capital: number;            // fonds propres (capital social + réserves + bénéfice reporté)
  dividendsPaid?: number;     // dividendes distribués (info, non déductibles)
};

export type PmDraft = {
  company: PmCompany;
  year: number;
  financials: PmFinancials;
};

export type PmDeclarationVs = {
  formId: string;
  version: string;
  year: number;
  generatedAt: string;
  company: PmCompany;
  financials: PmFinancials;
  benefitImposable: number;     // bénéfice net imposable = comptable + corrections
  taxEstimate: PmTaxEstimate;
  citations: Array<{
    law: string;
    article: string;
    text: string;
  }>;
};

/**
 * buildPmDeclarationVs — Construit la déclaration fiscale PM pour le canton du Valais.
 *
 * Calcule :
 *   1. bénéfice imposable = bénéfice comptable + corrections fiscales
 *   2. Estimation IFD (8.5% art. 68 LIFD) + ICC VS + impôt sur capital
 *
 * V1 : pas de rendu PDF (session 27+ avec wizard frontend).
 * Les champs de l'annexe CO (bilan détaillé, compte de résultat) seront
 * ajoutés en session 27-28 via le wizard PM step1-6.
 */
export function buildPmDeclarationVs(params: {
  tenantId: string;
  year: number;
  draft: PmDraft;
}): PmDeclarationVs {
  const { year, draft } = params;
  const { financials, company } = draft;

  // Bénéfice net imposable = bénéfice comptable + corrections fiscales
  // Corrections > 0 : charges non admises à réintégrer
  // Corrections < 0 : déductions fiscales supplémentaires
  const benefitImposable = financials.benefitAccounting + financials.corrections;

  const taxEstimate = estimatePmTaxDue({
    canton: "VS",
    year,
    benefit: Math.max(0, benefitImposable), // pas de bénéfice négatif pour l'imposition
    capital: financials.capital,
  });

  return {
    formId: "VS-declaration-pm",
    version: "1.0.0",
    year,
    generatedAt: new Date().toISOString(),
    company,
    financials,
    benefitImposable,
    taxEstimate,
    citations: [
      {
        law: "LIFD",
        article: "art. 58",
        text: "Le bénéfice net imposable comprend le solde du compte de résultats, compte tenu du solde reporté de l'exercice précédent.",
      },
      {
        law: "LIFD",
        article: "68",
        text: "Art. 68 LIFD : Impôt fédéral direct personnes morales = 8.5% du bénéfice net.",
      },
      {
        law: "CO",
        article: "art. 958",
        text: "La comptabilité doit être tenue de manière à donner une image fidèle du patrimoine, de la situation financière et des résultats de l'entreprise.",
      },
      {
        law: "LHID",
        article: "art. 24",
        text: "L'impôt sur le bénéfice a pour objet le bénéfice net. Font notamment partie du bénéfice net imposable le bénéfice net de l'exercice et les charges non justifiées par l'usage commercial.",
      },
    ],
  };
}
