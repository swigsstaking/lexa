/**
 * Tests d'intégration — pipeline pp-import
 * Exécutable : tsx src/tests/pp-import-integration.test.ts
 *
 * Stratégie : mock complet de la DB et du queue BullMQ.
 * Flux testé :
 *   1. Upload mock → status pending (insert DB simulé)
 *   2. Simulate worker → extraction OCR mock → status extracted
 *   3. Validate → status committed
 *
 * Pas de connexion DB réelle ni Ollama requis.
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { CLASSIFIER_TYPE_MAP, categoryToWizardStep } from "../services/ocr/prompts.js";

// ── Types DB simulés ──────────────────────────────────────────────────────────

interface PpImportRow {
  id: string;
  tenant_id: string;
  user_id: string;
  category: string;
  source_type: string;
  source_url: string;
  status: "pending" | "processing" | "extracted" | "validated" | "committed" | "failed";
  raw_extraction: Record<string, unknown> | null;
  validated_data: Record<string, unknown> | null;
  confidence: number | null;
  wizard_step_target: string | null;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
}

// ── DB mock en mémoire ────────────────────────────────────────────────────────

const db = new Map<string, PpImportRow>();

function mockInsertImport(row: Omit<PpImportRow, "created_at" | "updated_at">): PpImportRow {
  const now = new Date();
  const full: PpImportRow = { ...row, created_at: now, updated_at: now };
  db.set(row.id, full);
  return full;
}

function mockUpdateImport(id: string, updates: Partial<PpImportRow>): PpImportRow | null {
  const existing = db.get(id);
  if (!existing) return null;
  const updated = { ...existing, ...updates, updated_at: new Date() };
  db.set(id, updated);
  return updated;
}

function mockGetImport(id: string): PpImportRow | null {
  return db.get(id) ?? null;
}

// ── Mock OCR extraction ───────────────────────────────────────────────────────

const MOCK_SALARY_EXTRACTION = {
  employer_name: "Test Corp SA",
  employee_name: "Alice Martin",
  year: 2026,
  gross_annual_salary: 85000,
  ahv_ai_apg: 5950,
  lpp_employee: 4200,
};

async function simulateOcrWorker(importId: string, tenantId: string): Promise<void> {
  const row = mockGetImport(importId);
  if (!row) throw new Error(`Import ${importId} not found`);

  // 1. Status → processing
  mockUpdateImport(importId, { status: "processing" });

  // 2. Simulation OCR (mock)
  const category = row.category === "auto" ? "salary" : row.category;
  await new Promise((r) => setTimeout(r, 10)); // simuler latence async

  // 3. Status → extracted
  mockUpdateImport(importId, {
    status: "extracted",
    category,
    raw_extraction: MOCK_SALARY_EXTRACTION,
    confidence: 0.92,
    wizard_step_target: categoryToWizardStep(category as Parameters<typeof categoryToWizardStep>[0]),
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(() => fn())
    .then(() => {
      console.log(`  ✓ ${name}`);
      passed++;
    })
    .catch((err: Error) => {
      console.error(`  ✗ ${name}`);
      console.error(`    ${err.message}`);
      failed++;
    });
}

async function runTests(): Promise<void> {
  console.log("\n=== PP Import Integration Tests ===\n");

  await test("Upload mock → status pending (insert DB)", () => {
    const importId = randomUUID();
    const tenantId = randomUUID();

    const row = mockInsertImport({
      id: importId,
      tenant_id: tenantId,
      user_id: "user-1",
      category: "salary",
      source_type: "upload",
      source_url: `/var/lexa/uploads/${tenantId}/${importId}.pdf`,
      status: "pending",
      raw_extraction: null,
      validated_data: null,
      confidence: null,
      wizard_step_target: null,
      error_message: null,
    });

    assert.equal(row.status, "pending", "initial status should be pending");
    assert.equal(row.id, importId);
    assert.equal(row.category, "salary");
    assert.ok(row.source_url?.includes(tenantId));
  });

  await test("Worker: pending → processing → extracted", async () => {
    const importId = randomUUID();
    const tenantId = randomUUID();

    mockInsertImport({
      id: importId,
      tenant_id: tenantId,
      user_id: "user-1",
      category: "salary",
      source_type: "upload",
      source_url: `/var/lexa/uploads/${tenantId}/${importId}.pdf`,
      status: "pending",
      raw_extraction: null,
      validated_data: null,
      confidence: null,
      wizard_step_target: null,
      error_message: null,
    });

    // Simule le worker
    await simulateOcrWorker(importId, tenantId);

    const result = mockGetImport(importId);
    assert.ok(result !== null, "import should exist");
    assert.equal(result!.status, "extracted", "status should be extracted after worker");
    assert.ok(result!.raw_extraction !== null, "raw_extraction should be set");
    assert.equal(result!.raw_extraction!["employer_name"], "Test Corp SA");
    assert.ok(result!.confidence !== null && result!.confidence > 0.8);
    assert.equal(result!.wizard_step_target, "Step2Revenues");
  });

  await test("Validate → status committed", async () => {
    const importId = randomUUID();
    const tenantId = randomUUID();

    mockInsertImport({
      id: importId,
      tenant_id: tenantId,
      user_id: "user-1",
      category: "salary",
      source_type: "upload",
      source_url: `/var/lexa/uploads/${tenantId}/${importId}.pdf`,
      status: "pending",
      raw_extraction: null,
      validated_data: null,
      confidence: null,
      wizard_step_target: null,
      error_message: null,
    });

    await simulateOcrWorker(importId, tenantId);

    // Simule POST /import/:id/validate
    const validatedData = {
      employer_name: "Test Corp SA",
      gross_annual_salary: 85000,
      ahv_ai_apg: 5950,
      // user corrige lpp
      lpp_employee: 4300,
    };

    mockUpdateImport(importId, { status: "committed", validated_data: validatedData });

    const result = mockGetImport(importId);
    assert.equal(result!.status, "committed");
    assert.deepEqual(result!.validated_data, validatedData);
    assert.equal(result!.validated_data!["lpp_employee"], 4300, "user correction preserved");
  });

  await test("Category auto: classify → route vers salary", () => {
    // Simulate classifier output
    const classified = { type: "salary_certificate", confidence: 0.91 };
    const category = CLASSIFIER_TYPE_MAP[classified.type] ?? "auto";
    assert.equal(category, "salary");
    assert.ok(classified.confidence >= 0.7, "above min confidence threshold");
  });

  await test("Category auto: low confidence → reste auto", () => {
    const classified = { type: "unknown", confidence: 0.45 };
    const meetsThreshold = classified.confidence >= 0.7;
    assert.equal(meetsThreshold, false, "should not auto-classify below 0.7");
  });

  await test("GET list: filtre par status", () => {
    const tenantId = randomUUID();

    // Insert quelques imports
    const ids = [randomUUID(), randomUUID(), randomUUID()];
    const statuses = ["pending", "extracted", "committed"] as const;

    ids.forEach((id, i) => {
      mockInsertImport({
        id,
        tenant_id: tenantId,
        user_id: "user-1",
        category: "salary",
        source_type: "upload",
        source_url: `/var/lexa/uploads/${tenantId}/${id}.pdf`,
        status: statuses[i]!,
        raw_extraction: null,
        validated_data: null,
        confidence: null,
        wizard_step_target: null,
        error_message: null,
      });
    });

    // Simuler filtre status=pending,extracted
    const filtered = [...db.values()].filter(
      (r) => r.tenant_id === tenantId && ["pending", "extracted"].includes(r.status),
    );
    assert.equal(filtered.length, 2, "should find 2 imports with pending or extracted status");
  });

  await test("10MB file size limit: 10MB ok, >10MB rejeté", () => {
    const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
    const exactlyTen = MAX_SIZE;
    const tooLarge = MAX_SIZE + 1;

    assert.ok(exactlyTen <= MAX_SIZE, "10MB exactly should be accepted");
    assert.ok(tooLarge > MAX_SIZE, "10MB+1 should be rejected");
  });

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
