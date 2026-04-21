/**
 * elmParser.test.ts — Tests unitaires du parser Swissdec ELM 5.0
 *
 * Cas couverts :
 * 1. QR OK (base64 XML ELM valide) → SalaryExtraction complète
 * 2. QR présent mais XML invalide (mauvais namespace) → null
 * 3. Pas de QR (contenu aléatoire) → null
 * 4. XML direct sans QR → tryParseElmXml
 * 5. Mapping champs salary_2026 (2e fixture)
 *
 * Runner : tsx (pas de Jest requis, compatible module ESM)
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import { tryParseElmFromQr, tryParseElmXml } from "../elmParser.js";
import { validateElmXml } from "../xsdValidator.js";
import type { SalaryExtraction } from "../mapping.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, "fixtures");

// ─── Helpers ─────────────────────────────────────────────────────────────────

function readFixture(name: string): string {
  return readFileSync(join(FIXTURES, name), "utf-8");
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`FAIL: ${message}`);
  }
}

function assertNull(val: unknown, label: string): void {
  assert(val === null, `${label} devrait être null, got: ${JSON.stringify(val)}`);
}

function assertNotNull(val: unknown, label: string): void {
  assert(val !== null && val !== undefined, `${label} ne devrait pas être null`);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${(err as Error).message}`);
    failed++;
  }
}

// ─── Suite 1 : validateElmXml ────────────────────────────────────────────────

console.log("\n── Suite 1: validateElmXml ──");

test("valide un XML ELM salary_2025 correct", () => {
  const xml = readFixture("salary_2025.xml");
  const result = validateElmXml(xml);
  assert(result.valid, `validation échouée: ${result.errors.join(", ")}`);
  assert(
    result.namespace === "http://www.swissdec.ch/schema/sd/20050902/SalaryDeclaration",
    `namespace inattendu: ${result.namespace}`
  );
  assert(result.schemaVersion === "5.0", `version inattendue: ${result.schemaVersion}`);
});

test("rejette un XML sans namespace ELM", () => {
  const xml = `<?xml version="1.0"?><root><Company>test</Company><AccountingYear>2025</AccountingYear></root>`;
  const result = validateElmXml(xml);
  assert(!result.valid, "devrait être invalide");
  assert(result.errors.length > 0, "devrait avoir des erreurs");
});

test("rejette un XML vide", () => {
  const result = validateElmXml("");
  assert(!result.valid, "devrait être invalide");
  assert(result.errors.includes("XML vide"), "devrait indiquer XML vide");
});

test("valide le second fixture salary_2026", () => {
  const xml = readFixture("salary_2026.xml");
  const result = validateElmXml(xml);
  assert(result.valid, `validation échouée: ${result.errors.join(", ")}`);
});

// ─── Suite 2 : tryParseElmXml (cas nominal) ──────────────────────────────────

console.log("\n── Suite 2: tryParseElmXml (salary_2025) ──");

test("retourne SalaryExtraction pour salary_2025.xml", () => {
  const xml = readFixture("salary_2025.xml");
  const result = tryParseElmXml(xml);
  assertNotNull(result, "résultat");
  const r = result as SalaryExtraction;

  assert(r.employer_name === "ACME SA", `employer_name: ${r.employer_name}`);
  assert(r.employer_uid === "CHE-123.456.789", `employer_uid: ${r.employer_uid}`);
  assert(r.year === 2025, `year: ${r.year}`);
  assert(r.gross_annual_salary === 106000, `gross: ${r.gross_annual_salary}`);
  assert(r.ahv_ai_apg === 7420, `ahv: ${r.ahv_ai_apg}`);
  assert(r.lpp_employee === 6360, `lpp: ${r.lpp_employee}`);
  assert(r.alv_employee === 1060, `alv: ${r.alv_employee}`);
  assert(r.net_income === 91160, `net: ${r.net_income}`);
  assert(r.confidence === 1.0, `confidence: ${r.confidence}`);
  assert(r.source === "swissdec_elm", `source: ${r.source}`);
});

test("mappe le nom employé correctement", () => {
  const xml = readFixture("salary_2025.xml");
  const result = tryParseElmXml(xml) as SalaryExtraction;
  assert(result.employee_name === "Jean Dupont", `employee_name: ${result.employee_name}`);
  assert(result.employee_ahv === "756.1234.5678.90", `ahv_num: ${result.employee_ahv}`);
});

test("mappe les frais professionnels (commuting + meals)", () => {
  const xml = readFixture("salary_2025.xml");
  const result = tryParseElmXml(xml) as SalaryExtraction;
  // CommutingExpenses=3000 + MealExpenses=1500 = 4500
  assert(result.professional_expenses === 4500, `frais: ${result.professional_expenses}`);
  assert(result.meal_allowance === 1500, `meal: ${result.meal_allowance}`);
});

test("mappe les revenus détaillés (base, 13e, bonus)", () => {
  const xml = readFixture("salary_2025.xml");
  const result = tryParseElmXml(xml) as SalaryExtraction;
  assert(result.base_salary === 96000, `base: ${result.base_salary}`);
  assert(result.thirteenth_salary === 8000, `13e: ${result.thirteenth_salary}`);
  assert(result.bonus === 0, `bonus: ${result.bonus}`);
  assert(result.other_income === 2000, `other: ${result.other_income}`);
});

// ─── Suite 3 : tryParseElmXml (salary_2026) ──────────────────────────────────

console.log("\n── Suite 3: tryParseElmXml (salary_2026) ──");

test("retourne SalaryExtraction pour salary_2026.xml", () => {
  const xml = readFixture("salary_2026.xml");
  const result = tryParseElmXml(xml);
  assertNotNull(result, "résultat 2026");
  const r = result as SalaryExtraction;

  assert(r.employer_name === "TechZürich GmbH", `employer: ${r.employer_name}`);
  assert(r.year === 2026, `year: ${r.year}`);
  assert(r.gross_annual_salary === 91400, `gross: ${r.gross_annual_salary}`);
  assert(r.activity_rate === 80, `activity_rate: ${r.activity_rate}`);
  assert(r.lpp_employee === 8226, `lpp: ${r.lpp_employee}`);
  assert(r.confidence === 1.0, `confidence: ${r.confidence}`);
});

test("bonus mappé correctement (2026)", () => {
  const xml = readFixture("salary_2026.xml");
  const result = tryParseElmXml(xml) as SalaryExtraction;
  assert(result.bonus === 5000, `bonus: ${result.bonus}`);
  assert(result.thirteenth_salary === 0, `13e devrait être 0: ${result.thirteenth_salary}`);
});

// ─── Suite 4 : tryParseElmFromQr (QR base64) ─────────────────────────────────

console.log("\n── Suite 4: tryParseElmFromQr (QR base64) ──");

test("CAS 1 — QR OK : décode base64 et retourne SalaryExtraction", () => {
  const xml = readFixture("salary_2025.xml");
  const b64 = Buffer.from(xml, "utf-8").toString("base64");
  const result = tryParseElmFromQr(b64);
  assertNotNull(result, "résultat QR base64");
  const r = result as SalaryExtraction;
  assert(r.employer_name === "ACME SA", `employer: ${r.employer_name}`);
  assert(r.confidence === 1.0, `confidence: ${r.confidence}`);
});

test("CAS 1b — QR avec XML brut (sans base64) retourne SalaryExtraction", () => {
  const xml = readFixture("salary_2025.xml");
  const result = tryParseElmFromQr(xml);
  assertNotNull(result, "résultat QR XML brut");
  const r = result as SalaryExtraction;
  assert(r.year === 2025, `year: ${r.year}`);
});

test("CAS 2 — QR présent mais XML invalide (mauvais namespace) → null", () => {
  const invalidXml = `<?xml version="1.0"?>
    <SalaryDeclaration xmlns="http://example.com/wrong-namespace">
      <AccountingYear>2025</AccountingYear>
      <Company><CompanyDescription><CompanyName>Test</CompanyName></CompanyDescription></Company>
    </SalaryDeclaration>`;
  const b64 = Buffer.from(invalidXml, "utf-8").toString("base64");
  const result = tryParseElmFromQr(b64);
  assertNull(result, "résultat avec mauvais namespace");
});

test("CAS 3 — Pas de QR (contenu aléatoire) → null", () => {
  const randomContent = "NE SUIS PAS UN QR CODE ELM";
  const result = tryParseElmFromQr(randomContent);
  assertNull(result, "résultat avec contenu aléatoire");
});

test("CAS 3b — QR vide → null", () => {
  const result = tryParseElmFromQr("");
  assertNull(result, "résultat QR vide");
});

test("CAS 3c — QR base64 qui décode en texte non-XML → null", () => {
  const b64 = Buffer.from("Hello world, not XML at all!", "utf-8").toString("base64");
  const result = tryParseElmFromQr(b64);
  assertNull(result, "résultat base64 non-XML");
});

// ─── Suite 5 : tryParseElmXml (cas dégénérés) ────────────────────────────────

console.log("\n── Suite 5: cas dégénérés ──");

test("XML avec Company mais sans TaxSalary → retourne extraction partielle non-null", () => {
  const xml = `<?xml version="1.0"?>
    <SalaryDeclaration xmlns="http://www.swissdec.ch/schema/sd/20050902/SalaryDeclaration" schemaVersion="5.0">
      <GeneralSalaryDeclarationDescription><AccountingYear>2025</AccountingYear></GeneralSalaryDeclarationDescription>
      <Company>
        <CompanyDescription><CompanyName>TestCo</CompanyName></CompanyDescription>
        <Staff><Person>
          <Particulars><FirstName>A</FirstName><Name>B</Name></Particulars>
        </Person></Staff>
      </Company>
    </SalaryDeclaration>`;
  const result = tryParseElmXml(xml);
  assertNotNull(result, "résultat XML partiel");
  const r = result as SalaryExtraction;
  assert(r.employer_name === "TestCo", `employer: ${r.employer_name}`);
  assert(r.gross_annual_salary === null, `gross devrait être null: ${r.gross_annual_salary}`);
  assert(r.confidence === 1.0, `confidence: ${r.confidence}`);
});

test("tryParseElmXml avec XML null-like → null", () => {
  const result = tryParseElmXml("not xml at all");
  assertNull(result, "résultat XML invalide");
});

// ─── Bilan ────────────────────────────────────────────────────────────────────

console.log(`\n══════════════════════════════════════`);
console.log(`  Résultats : ${passed} passed, ${failed} failed`);
console.log(`══════════════════════════════════════\n`);

if (failed > 0) {
  process.exit(1);
}
