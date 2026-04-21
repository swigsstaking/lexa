/**
 * PmFormBuilder V1 — Déclaration fiscale PM (4 cantons : VS, GE, VD, FR)
 * Session 26 (VS) / Session 28 (GE, VD, FR)
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

export type Canton = "VS" | "GE" | "VD" | "FR" | "NE" | "JU" | "BJ";

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
  authority?: string;
};

/**
 * buildPmDeclaration — Factory générique pour tous les cantons PM (VS, GE, VD, FR).
 * Session 28 : extension de buildPmDeclarationVs pour GE/VD/FR.
 */
export function buildPmDeclaration(
  canton: Canton,
  params: { tenantId: string; year: number; draft: PmDraft },
): PmDeclarationVs {
  const { year, draft } = params;
  const { financials, company } = draft;

  const benefitImposable = financials.benefitAccounting + financials.corrections;

  const taxEstimate = estimatePmTaxDue({
    canton,
    year,
    benefit: Math.max(0, benefitImposable),
    capital: financials.capital,
  });

  const authorityMap: Record<Canton, string> = {
    VS: "Service cantonal des contributions VS (SCC VS)",
    GE: "Administration fiscale cantonale de Genève (AFC-GE)",
    VD: "Administration cantonale des impôts VD (ACI VD)",
    FR: "Service cantonal des contributions FR (SCC FR)",
    NE: "Service cantonal des contributions NE (SCC NE)",
    JU: "Service des contributions du Canton du Jura (SCCJ)",
    BJ: "Administration fiscale du canton de Berne — section francophone (ADB)",
  };

  const cantonLabelMap: Record<Canton, string> = {
    VS: "Valais",
    GE: "Genève",
    VD: "Vaud",
    FR: "Fribourg",
    NE: "Neuchâtel",
    JU: "Jura",
    BJ: "Jura bernois (Berne)",
  };

  const legalSourceMap: Record<Canton, string> = {
    VS: "LF VS section PM — taux cantonal + coefficient multiplicateur communal",
    GE: "LIPM GE (RSG D 3 09) — impôt proportionnel sur bénéfice PM",
    VD: "LI VD (BLV 642.11) — barème PM + coefficient communal",
    FR: "LICD FR (BDLF 631.1) — section PM",
    NE: "LIPM-NE (RSN 631.0) — impôt sur le bénéfice et le capital PM",
    JU: "LICD-JU (RSJU 641.11) — impôt sur le bénéfice et le capital PM",
    BJ: "LICD-BE (RSB 661.11) — impôt sur le bénéfice et le capital PM (Berne)",
  };

  return {
    formId: `${canton}-declaration-pm`,
    version: "1.0.0",
    year,
    generatedAt: new Date().toISOString(),
    company: { ...company, canton },
    financials,
    benefitImposable,
    taxEstimate,
    authority: authorityMap[canton],
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
      {
        law: legalSourceMap[canton],
        article: `ICC ${canton}`,
        text: `TODO session 30+ : valider taux ICC PM ${cantonLabelMap[canton]} officiel (approximation V1 utilisée).`,
      },
    ],
  };
}

/**
 * buildPmDeclarationVs — Alias de buildPmDeclaration("VS") pour compatibilité S27.
 * Ne pas supprimer : utilisé par les routes companies.ts et PmPdfRenderer.
 */
export function buildPmDeclarationVs(params: {
  tenantId: string;
  year: number;
  draft: PmDraft;
}): PmDeclarationVs {
  return buildPmDeclaration("VS", params);
}
