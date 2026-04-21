/**
 * Tests unitaires — parser JSON output OCR (snapshots de réponses Ollama)
 * Exécutable : tsx src/tests/ocr-parser.test.ts
 *
 * Valide :
 * 1. Parser JSON extraction salaire
 * 2. Parser JSON extraction frais déductibles
 * 3. Parser JSON classification auto
 * 4. Robustesse sur réponse mal-formée (markdown, confiance manquante)
 */

import assert from "node:assert/strict";
import { CLASSIFIER_TYPE_MAP, categoryToWizardStep, getPromptForCategory } from "../services/ocr/prompts.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function cleanJson(raw: string): string {
  return raw
    .replace(/^```json\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function parseOcrOutput(raw: string): { fields: Record<string, unknown>; confidence: number } {
  const cleaned = cleanJson(raw);
  const parsed = JSON.parse(cleaned) as Record<string, unknown>;
  const confidence = typeof parsed["confidence"] === "number" ? (parsed["confidence"] as number) : 0.7;
  const fields = { ...parsed };
  delete fields["confidence"];
  return { fields, confidence };
}

// ── Snapshot 1 : certificat de salaire ───────────────────────────────────────

const SNAPSHOT_SALARY_RESPONSE = JSON.stringify({
  employer_name: "ACME SA",
  employer_uid: "CHE-123.456.789",
  employee_name: "Jean Dupont",
  year: 2026,
  gross_annual_salary: 102000,
  thirteenth_salary: 8500,
  bonus: 6000,
  ahv_ai_apg: 7140,
  lpp_employee: 6120,
  alv_employee: 2550,
  professional_expenses: 3000,
  other_income: null,
  confidence: 0.94,
});

// ── Snapshot 2 : frais déductibles ───────────────────────────────────────────

const SNAPSHOT_EXPENSE_RESPONSE = `\`\`\`json
{
  "vendor": "CFF AG",
  "date": "2026-03-15",
  "amount_ttc": 1240.50,
  "amount_ht": null,
  "tva": null,
  "tva_rate": null,
  "description": "Abonnement demi-tarif annuel",
  "category_hint": "transport",
  "confidence": 0.88
}
\`\`\``;

// ── Snapshot 3 : classification auto ─────────────────────────────────────────

const SNAPSHOT_CLASSIFIER_RESPONSE = JSON.stringify({
  type: "salary_certificate",
  confidence: 0.92,
});

const SNAPSHOT_CLASSIFIER_UNKNOWN = JSON.stringify({
  type: "unknown",
  confidence: 0.35,
});

// ── Snapshot 4 : réponse mal-formée (manque confidence) ──────────────────────

const SNAPSHOT_MALFORMED = JSON.stringify({
  bank_name: "UBS SA",
  iban: "CH56 0483 5012 3456 7800 9",
  closing_balance: 45280.50,
  currency: "CHF",
  year: 2026,
  // confidence absent → doit fallback à 0.7
});

// ── Tests ─────────────────────────────────────────────────────────────────────

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

console.log("\n=== OCR Parser Unit Tests ===\n");

test("Snapshot salary: parse JSON + extraire confidence", () => {
  const { fields, confidence } = parseOcrOutput(SNAPSHOT_SALARY_RESPONSE);
  assert.equal(confidence, 0.94, "confidence should be 0.94");
  assert.equal(fields["employer_name"], "ACME SA");
  assert.equal(fields["gross_annual_salary"], 102000);
  assert.equal(fields["ahv_ai_apg"], 7140);
  assert.equal(fields["other_income"], null);
  assert.ok(!("confidence" in fields), "confidence should be removed from fields");
});

test("Snapshot expense: parse JSON avec markdown wrappers", () => {
  const { fields, confidence } = parseOcrOutput(SNAPSHOT_EXPENSE_RESPONSE);
  assert.equal(confidence, 0.88, "confidence should be 0.88");
  assert.equal(fields["vendor"], "CFF AG");
  assert.equal(fields["amount_ttc"], 1240.50);
  assert.equal(fields["category_hint"], "transport");
});

test("Snapshot classifier: mapping type → ImportCategory", () => {
  const parsed = JSON.parse(cleanJson(SNAPSHOT_CLASSIFIER_RESPONSE)) as { type: string; confidence: number };
  const category = CLASSIFIER_TYPE_MAP[parsed.type] ?? "auto";
  assert.equal(category, "salary", "salary_certificate → salary");
  assert.equal(parsed.confidence, 0.92);
});

test("Snapshot classifier unknown: fallback à auto", () => {
  const parsed = JSON.parse(cleanJson(SNAPSHOT_CLASSIFIER_UNKNOWN)) as { type: string; confidence: number };
  const category = CLASSIFIER_TYPE_MAP[parsed.type] ?? "auto";
  assert.equal(category, "auto", "unknown → auto");
  assert.ok(parsed.confidence < 0.7, "low confidence for unknown");
});

test("Snapshot malformed: confidence absente → fallback 0.7", () => {
  const { fields, confidence } = parseOcrOutput(SNAPSHOT_MALFORMED);
  assert.equal(confidence, 0.7, "should fallback to 0.7 when confidence absent");
  assert.equal(fields["bank_name"], "UBS SA");
  assert.equal(fields["closing_balance"], 45280.50);
});

test("categoryToWizardStep: salary → Step2Revenues", () => {
  assert.equal(categoryToWizardStep("salary"), "Step2Revenues");
});

test("categoryToWizardStep: wealth → Step3Wealth", () => {
  assert.equal(categoryToWizardStep("wealth"), "Step3Wealth");
});

test("categoryToWizardStep: expense → Step4Deductions", () => {
  assert.equal(categoryToWizardStep("expense"), "Step4Deductions");
});

test("categoryToWizardStep: insurance → Step4Deductions", () => {
  assert.equal(categoryToWizardStep("insurance"), "Step4Deductions");
});

test("getPromptForCategory: salary contient 'Swissdec'", () => {
  const prompt = getPromptForCategory("salary");
  assert.ok(prompt.includes("Swissdec"), "salary prompt should mention Swissdec");
  assert.ok(prompt.includes("JSON"), "prompt should request JSON output");
});

test("getPromptForCategory: expense contient 'vendor'", () => {
  const prompt = getPromptForCategory("expense");
  assert.ok(prompt.includes("vendor"), "expense prompt should mention vendor");
});

// ── Rapport ───────────────────────────────────────────────────────────────────

console.log(`\nResults: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
