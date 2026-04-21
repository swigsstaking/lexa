/**
 * mapping.ts — Swissdec ELM → SalaryExtraction (wizard PP Step2Revenues)
 *
 * Mappe les champs XML du Lohnausweis ELM 5.0 vers la structure utilisée
 * par le wizard fiscal PP Lexa (Step2Revenues).
 *
 * Spec : tasks/pp-import-modal-spec.md §8.3
 * Namespace ELM : http://www.swissdec.ch/schema/sd/20050902/SalaryDeclaration
 */

/** Structure de sortie du wizard PP Step2Revenues */
export interface SalaryExtraction {
  // Employeur
  employer_name: string | null;
  employer_uid: string | null;

  // Employé
  employee_name: string | null;
  employee_ahv: string | null;

  // Période
  year: number | null;
  period_from: string | null;
  period_to: string | null;
  activity_rate: number | null;

  // Revenus bruts (ligne Lohnausweis)
  gross_annual_salary: number | null;  // z8 GrossIncome
  base_salary: number | null;          // z1
  thirteenth_salary: number | null;    // z2
  bonus: number | null;                // z3
  other_income: number | null;         // z7

  // Déductions (z9, z10)
  ahv_ai_apg: number | null;          // AHV_IV_EO_Contribution
  alv_employee: number | null;         // ALV_Contribution
  lpp_employee: number | null;         // BVG_LPP_Contribution

  // Net (z11)
  net_income: number | null;

  // Frais professionnels (z13)
  professional_expenses: number | null;  // CommutingExpenses + MealExpenses
  meal_allowance: number | null;         // MealExpenses uniquement

  // Confiance (toujours 1.0 quand QR-code parsé)
  confidence: number;

  // Source
  source: "swissdec_elm";
}

/** Type interne pour les champs parsés par fast-xml-parser */
interface ElmParsed {
  SalaryDeclaration?: {
    GeneralSalaryDeclarationDescription?: {
      AccountingYear?: string | number;
    };
    Company?: {
      CompanyDescription?: {
        CompanyName?: string;
        "UID-EHRA"?: string;
      };
      Staff?: {
        Person?: ElmPerson | ElmPerson[];
      };
    };
  };
}

interface ElmPerson {
  Particulars?: {
    "SV-AS-Number"?: string;
    FirstName?: string;
    Name?: string;
  };
  Salary?: {
    TaxSalaries?: {
      TaxSalary?: ElmTaxSalary | ElmTaxSalary[];
    };
  };
}

interface ElmTaxSalary {
  PeriodFrom?: string;
  PeriodTo?: string;
  ActivityRate?: string | number;
  Income?: {
    BaseSalary?: string | number;
    ThirteenthSalary?: string | number;
    Bonus?: string | number;
    OtherIncome?: string | number;
  };
  GrossIncome?: string | number;
  Deductions?: {
    AHV_IV_EO_Contribution?: string | number;
    ALV_Contribution?: string | number;
    BVG_LPP_Contribution?: string | number;
  };
  NetIncome?: string | number;
  Expenses?: {
    CommutingExpenses?: string | number;
    MealExpenses?: string | number;
  };
}

/** Parse un nombre depuis une valeur potentiellement string ou number */
function toNum(val: string | number | undefined | null): number | null {
  if (val === undefined || val === null) return null;
  const n = typeof val === "number" ? val : parseFloat(String(val));
  return isNaN(n) ? null : n;
}

/** Somme deux valeurs nullable (null + null = null, sinon somme) */
function sumNullable(a: number | null, b: number | null): number | null {
  if (a === null && b === null) return null;
  return (a ?? 0) + (b ?? 0);
}

/**
 * Mappe un objet ELM parsé (fast-xml-parser) vers SalaryExtraction.
 * Prend la première Person et le premier TaxSalary trouvés.
 *
 * @param parsed - Objet JS résultat de fast-xml-parser sur le XML ELM
 * @returns SalaryExtraction ou null si la structure est trop incomplète
 */
export function mapElmToSalaryExtraction(parsed: ElmParsed): SalaryExtraction | null {
  const decl = parsed?.SalaryDeclaration;
  if (!decl) return null;

  // Année comptable
  const year = toNum(decl.GeneralSalaryDeclarationDescription?.AccountingYear);

  // Société
  const company = decl.Company?.CompanyDescription;
  const employer_name = company?.CompanyName ?? null;
  const employer_uid = company?.["UID-EHRA"] ?? null;

  // Première personne du staff
  const personRaw = decl.Company?.Staff?.Person;
  const person: ElmPerson | undefined = Array.isArray(personRaw)
    ? personRaw[0]
    : personRaw;

  if (!person) return null;

  const particulars = person.Particulars;
  const firstName = particulars?.FirstName ?? "";
  const lastName = particulars?.Name ?? "";
  const employee_name = [firstName, lastName].filter(Boolean).join(" ") || null;
  const employee_ahv = particulars?.["SV-AS-Number"] ?? null;

  // Premier TaxSalary
  const taxSalaryRaw = person.Salary?.TaxSalaries?.TaxSalary;
  const taxSalary: ElmTaxSalary | undefined = Array.isArray(taxSalaryRaw)
    ? taxSalaryRaw[0]
    : taxSalaryRaw;

  if (!taxSalary) {
    // Structure incomplète mais on retourne ce qu'on a
    return {
      employer_name,
      employer_uid,
      employee_name,
      employee_ahv,
      year,
      period_from: null,
      period_to: null,
      activity_rate: null,
      gross_annual_salary: null,
      base_salary: null,
      thirteenth_salary: null,
      bonus: null,
      other_income: null,
      ahv_ai_apg: null,
      alv_employee: null,
      lpp_employee: null,
      net_income: null,
      professional_expenses: null,
      meal_allowance: null,
      confidence: 1.0,
      source: "swissdec_elm",
    };
  }

  const period_from = taxSalary.PeriodFrom ?? null;
  const period_to = taxSalary.PeriodTo ?? null;
  const activity_rate = toNum(taxSalary.ActivityRate);

  // Revenus
  const income = taxSalary.Income;
  const base_salary = toNum(income?.BaseSalary);
  const thirteenth_salary = toNum(income?.ThirteenthSalary);
  const bonus = toNum(income?.Bonus);
  const other_income = toNum(income?.OtherIncome);
  const gross_annual_salary = toNum(taxSalary.GrossIncome);

  // Déductions
  const deductions = taxSalary.Deductions;
  const ahv_ai_apg = toNum(deductions?.AHV_IV_EO_Contribution);
  const alv_employee = toNum(deductions?.ALV_Contribution);
  const lpp_employee = toNum(deductions?.BVG_LPP_Contribution);

  // Net
  const net_income = toNum(taxSalary.NetIncome);

  // Frais
  const expenses = taxSalary.Expenses;
  const commuting = toNum(expenses?.CommutingExpenses);
  const meal_allowance = toNum(expenses?.MealExpenses);
  const professional_expenses = sumNullable(commuting, meal_allowance);

  return {
    employer_name,
    employer_uid,
    employee_name,
    employee_ahv,
    year,
    period_from,
    period_to,
    activity_rate,
    gross_annual_salary,
    base_salary,
    thirteenth_salary,
    bonus,
    other_income,
    ahv_ai_apg,
    alv_employee,
    lpp_employee,
    net_income,
    professional_expenses,
    meal_allowance,
    confidence: 1.0,
    source: "swissdec_elm",
  };
}
