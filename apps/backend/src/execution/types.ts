export type VatRateCode = "standard" | "reduced" | "lodging";

export type VatRate = {
  code: VatRateCode;
  rate: number;
  label: string;
};

export type TvaFormTemplate = {
  form_id: string;
  version: string;
  title: string;
  jurisdiction: string;
  authority: string;
  legal_reference: {
    law: string;
    rs: string;
    articles: string[];
  };
  periodicity: string;
  method: string;
  vat_rates: VatRate[];
  fields: Array<{
    id: string;
    label: string;
    source: string;
    validation?: string;
    format?: string;
    note?: string;
    todo?: boolean;
  }>;
  output: {
    pdf: { renderer: string; disclaimer: string };
    xml: { schema: string; version: string; note?: string };
  };
  validation: {
    human_signature_required: boolean;
    lexa_liability: string;
  };
};

export type TvaProjection = {
  caHt: Record<VatRateCode, number>;
  caTtc: Record<VatRateCode, number>;
  tvaDue: Record<VatRateCode, number> & { total: number };
  impotPrealable: {
    operating: number;
    capex: number;
    total: number;
  };
  solde: number;
  caExonere: number;
  eventCount: number;
};

export type CompanyInfo = {
  tenantId: string;
  uid: string | null;
  name: string;
  vatNumber: string | null;
  canton: string | null;
  legalForm: string;
};

export type FilledFormPeriod =
  | {
      kind: "quarterly";
      quarter: 1 | 2 | 3 | 4;
      year: number;
      start: string;
      end: string;
    }
  | {
      kind: "annual";
      year: number;
      start: string;
      end: string;
    };

export type FilledForm = {
  formId: string;
  version: string;
  method: "effective" | "tdfn";
  period: FilledFormPeriod;
  company: CompanyInfo;
  projection: TvaProjection;
  template: TvaFormTemplate;
  generatedAt: string;
};

export function quarterRange(quarter: 1 | 2 | 3 | 4, year: number): { start: string; end: string } {
  const startMonth = (quarter - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  const mm = (n: number) => String(n).padStart(2, "0");
  const lastDay = new Date(year, endMonth, 0).getDate();
  return {
    start: `${year}-${mm(startMonth)}-01`,
    end: `${year}-${mm(endMonth)}-${mm(lastDay)}`,
  };
}

export function annualRange(year: number): { start: string; end: string } {
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

// ── Simulateur fiscal V1 ──────────────────────────────
export type TaxEstimate = {
  icc: number;           // Impôt cantonal + communal CHF
  ifd: number;           // Impôt fédéral direct CHF
  total: number;         // ICC + IFD
  effectiveRate: number; // total / revenuImposable (ratio, pas %)
  disclaimer: string;
};

// ── Déclaration fiscale PP Valais ──────────────────────
export type VsPpProjection = {
  // Section Revenus
  revenuSalaire: number;           // step2.salaireBrut (ou 0)
  revenuIndependant: number;       // projection ledger (bénéfice)
  revenuAccessoires: number;       // step2.revenusAccessoires
  revenuRentes: number;            // AVS + LPP + 3e pilier
  revenuCapital: number;           // step2.revenusTitres
  revenuImmobilier: number;        // step2.revenusImmobiliers
  revenuTotal: number;

  // Section Fortune
  fortuneBrute: number;            // Σ actifs (comptes + titres + immeubles + ...)
  fortuneDettes: number;           // Σ dettes (emprunt immo + step3.dettes)
  fortuneNette: number;            // brute - dettes

  // Section Déductions
  deductionPilier3a: number;       // step4.pilier3a
  deductionLppRachats: number;     // step4.rachatsLpp
  deductionPrimes: number;         // step4.primesAssurance
  deductionInterets: number;       // step4.interetsPassifs
  deductionFraisPro: number;       // forfait ou réel selon step4.fraisProFormat
  deductionFraisMedicaux: number;
  deductionDons: number;
  deductionTotal: number;

  // Résultat
  revenuImposable: number;

  // Simulateur fiscal V1 (optionnel — absent si revenuImposable <= 0)
  taxEstimate?: TaxEstimate;

  // Méta
  source: "draft" | "ledger" | "mixed";
  eventCount: number;
};

export type VsPpFormTemplate = {
  form_id: string;
  version: string;
  title: string;
  jurisdiction: string;
  canton: string;
  authority: string;
  periodicity: string;
  legal_reference: {
    law: string;
    rs: string;
    articles: string[];
    federal_refs?: string[];
  };
  reference_amounts: {
    pilier_3a_salarie_max_chf: number;
    pilier_3a_independant_max_chf: number;
    frais_professionnels_forfait_pct: number;
    frais_professionnels_forfait_min_chf: number;
    frais_professionnels_forfait_max_chf: number;
  };
  fields: Array<{
    id: string;
    label: string;
    source: string;
    validation?: string;
    format?: string;
    note?: string;
    todo?: boolean;
  }>;
  output: {
    pdf: { renderer: string; disclaimer: string };
    xml: { schema: string; note?: string };
  };
  validation: {
    human_signature_required: boolean;
    lexa_liability: string;
  };
};

export type FilledVsPpForm = {
  formId: string;
  version: string;
  year: number;
  company: CompanyInfo;
  projection: VsPpProjection;
  template: VsPpFormTemplate;
  generatedAt: string;
};
