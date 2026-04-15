/**
 * qa-lexa — Tests de régression légers sur les agents Lexa.
 *
 * Exécution :
 *   tsx src/scripts/qa-lexa.ts
 *   BASE_URL=http://192.168.110.59:3010 tsx src/scripts/qa-lexa.ts
 *
 * Hit les endpoints live et vérifie :
 *   - /rag/classify : 5 transactions → compte débit/crédit non vide + ≥1 citation
 *   - /agents/tva/ask : 3 questions TVA → ≥1 citation LTVA/OLTVA/Info TVA
 *   - /agents/fiscal-pp/ask : 2 questions VS-PP → ≥1 citation VS-*
 *
 * Output JSON (pass/fail par test + latence + total).
 */

import axios, { type AxiosInstance } from "axios";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3010";
const QA_EMAIL = process.env.QA_EMAIL ?? "qa@lexa.test";
const QA_PASSWORD = process.env.QA_PASSWORD ?? "QaLexa-Fixed-2026!";
const TIMEOUT_MS = 120_000;

const http: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: TIMEOUT_MS,
  headers: { "Content-Type": "application/json" },
});

let authToken: string | null = null;

async function loginQaUser(): Promise<void> {
  try {
    const { data } = await http.post<{ token: string }>("/auth/login", {
      email: QA_EMAIL,
      password: QA_PASSWORD,
    });
    authToken = data.token;
    http.defaults.headers.common["Authorization"] = `Bearer ${authToken}`;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      if (err.response?.status === 401) {
        console.error(
          `[qa-lexa] FAIL login 401 — user ${QA_EMAIL} not seeded. Run: tsx src/scripts/seed-qa-user.ts`,
        );
      } else if (err.response?.status === 429) {
        console.error(
          `[qa-lexa] FAIL login 429 — rate limited, wait 15 min`,
        );
      } else {
        console.error(`[qa-lexa] FAIL login ${err.response?.status}:`, err.message);
      }
    } else {
      console.error("[qa-lexa] FAIL login:", err);
    }
    process.exit(2);
  }
}

type TestResult = {
  id: string;
  kind: "classify" | "tva" | "fiscal-pp-vs" | "fiscal-pp-ge" | "fiscal-pp-vd" | "fiscal-pp-fr" | "taxpayer";
  pass: boolean;
  latencyMs: number;
  reason?: string;
  citations?: number;
  agentDurationMs?: number;
};

// ── Fixtures ───────────────────────────────────────────

const classifyFixtures = [
  {
    id: "cl-1-fiduciaire",
    description: "FIDUCIAIRE DUPONT HONORAIRES MENSUELS",
    amount: -450,
  },
  {
    id: "cl-2-loyer",
    description: "LOYER BUREAU AVRIL 2026",
    amount: -1800,
  },
  {
    id: "cl-3-migros",
    description: "MIGROS COFFEE PAUSE EQUIPE",
    amount: -42.5,
  },
  {
    id: "cl-4-swisscom",
    description: "SWISSCOM ABONNEMENT INTERNET BUREAU",
    amount: -89,
  },
  {
    id: "cl-5-salaire",
    description: "SALAIRE COLLABORATEUR AVRIL 2026",
    amount: -5500,
  },
];

const tvaQuestions = [
  {
    id: "tva-1-rate-standard",
    question: "Quel est le taux TVA standard en Suisse depuis 2024?",
  },
  {
    id: "tva-2-tdfn-threshold",
    question:
      "Quels sont les seuils actuels d eligibilite a la methode TDFN (CA et impot) en 2024?",
  },
  {
    id: "tva-3-immeuble",
    question:
      "Un proprietaire peut-il opter pour la TVA sur la location d un local commercial?",
  },
];

const fiscalPpQuestions = [
  {
    id: "pp-1-pilier-3a",
    question:
      "Quel est le plafond du pilier 3a 2024 pour un salarie affilie LPP en Valais?",
    context: { status: "salarie" as const, commune: "Sion" },
  },
  {
    id: "pp-2-frais-pro",
    question:
      "Quelles sont les regles du forfait frais professionnels pour un salarie en Valais?",
    context: { status: "salarie" as const },
  },
];

const fiscalPpGeQuestions = [
  {
    id: "pp-ge-1-pilier-3a",
    question:
      "Un salarie marie a Geneve peut-il deduire le pilier 3a et quel est le plafond 2024 ?",
    context: {
      status: "salarie" as const,
      commune: "Geneve",
      civilStatus: "married" as const,
    },
  },
];

const fiscalPpVdQuestions = [
  {
    id: "pp-vd-1-pilier-3a",
    question: "Plafond pilier 3a salarie Lausanne 2026 ?",
    context: { commune: "Lausanne" },
  },
];

const fiscalPpFrQuestions = [
  {
    id: "pp-fr-1-pilier-3a",
    question: "Quel est le plafond du pilier 3a 2026 pour un salarie affilie LPP domicilie a Fribourg ?",
    context: { status: "salarie" as const, commune: "Fribourg" },
  },
];

// ── Helpers ────────────────────────────────────────────

async function runClassify(
  fixture: (typeof classifyFixtures)[number],
): Promise<TestResult> {
  const started = Date.now();
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await http.post("/rag/classify", {
      date: today,
      description: fixture.description,
      amount: fixture.amount,
      currency: "CHF",
    });
    const citations = Array.isArray(data.citations) ? data.citations.length : 0;
    const debit =
      data?.classification?.debitAccount ??
      data?.debitAccount ??
      data?.result?.debitAccount;
    const credit =
      data?.classification?.creditAccount ??
      data?.creditAccount ??
      data?.result?.creditAccount;
    const hasAccount = Boolean(debit && credit);
    return {
      id: fixture.id,
      kind: "classify",
      pass: hasAccount,
      latencyMs: Date.now() - started,
      citations,
      agentDurationMs: data.durationMs,
      reason: hasAccount ? undefined : "no debit/credit account",
    };
  } catch (err) {
    return {
      id: fixture.id,
      kind: "classify",
      pass: false,
      latencyMs: Date.now() - started,
      reason: err instanceof Error ? err.message : "unknown error",
    };
  }
}

async function runTvaQuestion(
  fixture: (typeof tvaQuestions)[number],
): Promise<TestResult> {
  const started = Date.now();
  try {
    const { data } = await http.post("/agents/tva/ask", {
      question: fixture.question,
    });
    const citations = Array.isArray(data.citations) ? data.citations.length : 0;
    const hasVatCitation =
      Array.isArray(data.citations) &&
      data.citations.some((c: { law?: string }) =>
        ["LTVA", "OLTVA"].includes(c.law ?? "") ||
          (c.law ?? "").startsWith("AFC-INFO_TVA"),
      );
    return {
      id: fixture.id,
      kind: "tva",
      pass: citations > 0 && hasVatCitation,
      latencyMs: Date.now() - started,
      citations,
      agentDurationMs: data.durationMs,
      reason:
        citations === 0
          ? "no citations"
          : hasVatCitation
            ? undefined
            : "no LTVA/OLTVA/Info TVA citation",
    };
  } catch (err) {
    return {
      id: fixture.id,
      kind: "tva",
      pass: false,
      latencyMs: Date.now() - started,
      reason: err instanceof Error ? err.message : "unknown error",
    };
  }
}

async function runFiscalPpGeQuestion(
  fixture: (typeof fiscalPpGeQuestions)[number],
): Promise<TestResult> {
  const started = Date.now();
  try {
    const { data } = await http.post("/agents/fiscal-pp-ge/ask", {
      question: fixture.question,
      context: fixture.context,
    });
    const citations = Array.isArray(data.citations) ? data.citations.length : 0;
    // Assert : au moins 1 citation, et l'answer contient "7 056" (le plafond
    // pilier 3a 2024 salarié) — indique que le modèle a bien compris et
    // répondu en utilisant la donnée fédérale applicable à GE.
    const answerStr = typeof data.answer === "string" ? data.answer : "";
    const hasPlafond =
      answerStr.includes("7 056") ||
      answerStr.includes("7056") ||
      answerStr.includes("7'056");
    return {
      id: fixture.id,
      kind: "fiscal-pp-ge",
      pass: citations > 0 && hasPlafond,
      latencyMs: Date.now() - started,
      citations,
      agentDurationMs: data.durationMs,
      reason:
        citations === 0
          ? "no citations"
          : hasPlafond
            ? undefined
            : "answer missing 7056 plafond",
    };
  } catch (err) {
    return {
      id: fixture.id,
      kind: "fiscal-pp-ge",
      pass: false,
      latencyMs: Date.now() - started,
      reason: err instanceof Error ? err.message : "unknown error",
    };
  }
}

async function runTaxpayerDraftCreate(): Promise<TestResult> {
  const started = Date.now();
  const year = new Date().getFullYear();
  try {
    // Reset (safe if not existing)
    await http.post("/taxpayers/draft/reset", { fiscalYear: year }).catch(() => null);
    // GET creates a fresh empty draft
    const { data: draftData } = await http.get("/taxpayers/draft", {
      params: { year },
    });
    if (!draftData?.draft?.id) {
      return {
        id: "tx-1-draft-create",
        kind: "taxpayer",
        pass: false,
        latencyMs: Date.now() - started,
        reason: "no draft.id in response",
      };
    }
    // PATCH 3 fields
    const patches = [
      { field: "step1.firstName", value: "Qa", step: 1 },
      { field: "step1.lastName", value: "Lexa", step: 1 },
      { field: "step2.salaireBrut", value: 80000, step: 2 },
    ];
    for (const p of patches) {
      await http.patch("/taxpayers/draft/field", { fiscalYear: year, ...p });
    }
    // Re-fetch and assert
    const { data: refetched } = await http.get("/taxpayers/draft", {
      params: { year },
    });
    const s = refetched.draft.state;
    const ok =
      s.step1.firstName === "Qa" &&
      s.step1.lastName === "Lexa" &&
      s.step2.salaireBrut === 80000;
    return {
      id: "tx-1-draft-create",
      kind: "taxpayer",
      pass: ok,
      latencyMs: Date.now() - started,
      reason: ok ? undefined : "fields not persisted correctly",
    };
  } catch (err) {
    return {
      id: "tx-1-draft-create",
      kind: "taxpayer",
      pass: false,
      latencyMs: Date.now() - started,
      reason: err instanceof Error ? err.message : "unknown error",
    };
  }
}

async function runTaxpayerDraftSubmit(): Promise<TestResult> {
  const started = Date.now();
  const year = new Date().getFullYear();
  try {
    // Fill a minimally useful draft (assume runTaxpayerDraftCreate a déjà posé le base)
    const patches = [
      { field: "step1.civilStatus", value: "single", step: 1 },
      { field: "step1.commune", value: "Sion", step: 1 },
      { field: "step2.isSalarie", value: true, step: 2 },
      { field: "step3.comptesBancaires", value: 15000, step: 3 },
      { field: "step4.pilier3a", value: 7056, step: 4 },
      { field: "step4.fraisProFormat", value: "forfait", step: 4 },
    ];
    for (const p of patches) {
      await http.patch("/taxpayers/draft/field", { fiscalYear: year, ...p });
    }

    const { data } = await http.post("/taxpayers/draft/submit", {
      fiscalYear: year,
    });
    const pdfB64 = data.pdf as string;
    const pdfBytes = Buffer.from(pdfB64, "base64");
    const source = data.form?.projection?.source;
    const hasRevenuSalaire =
      data.form?.projection?.revenuSalaire === 80000;
    const notSeed =
      !pdfBytes.toString("latin1").includes("6253");
    const ok =
      source === "draft" && pdfBytes.length > 2000 && hasRevenuSalaire && notSeed;
    return {
      id: "tx-2-draft-submit",
      kind: "taxpayer",
      pass: ok,
      latencyMs: Date.now() - started,
      reason: ok
        ? undefined
        : `source=${source}, bytes=${pdfBytes.length}, hasSalaire=${hasRevenuSalaire}, notSeed=${notSeed}`,
    };
  } catch (err) {
    return {
      id: "tx-2-draft-submit",
      kind: "taxpayer",
      pass: false,
      latencyMs: Date.now() - started,
      reason: err instanceof Error ? err.message : "unknown error",
    };
  }
}

async function runFiscalPpQuestion(
  fixture: (typeof fiscalPpQuestions)[number],
): Promise<TestResult> {
  const started = Date.now();
  try {
    const { data } = await http.post("/agents/fiscal-pp/ask", {
      question: fixture.question,
      context: fixture.context,
    });
    const citations = Array.isArray(data.citations) ? data.citations.length : 0;
    const hasVsCitation =
      Array.isArray(data.citations) &&
      data.citations.some((c: { law?: string }) =>
        (c.law ?? "").startsWith("VS-"),
      );
    return {
      id: fixture.id,
      kind: "fiscal-pp-vs",
      pass: citations > 0 && hasVsCitation,
      latencyMs: Date.now() - started,
      citations,
      agentDurationMs: data.durationMs,
      reason:
        citations === 0
          ? "no citations"
          : hasVsCitation
            ? undefined
            : "no VS-* citation",
    };
  } catch (err) {
    return {
      id: fixture.id,
      kind: "fiscal-pp-vs",
      pass: false,
      latencyMs: Date.now() - started,
      reason: err instanceof Error ? err.message : "unknown error",
    };
  }
}

async function runFiscalPpVdQuestion(
  fixture: (typeof fiscalPpVdQuestions)[number],
): Promise<TestResult> {
  const started = Date.now();
  try {
    const { data } = await http.post("/agents/fiscal-pp-vd/ask", {
      question: fixture.question,
      context: fixture.context,
    });
    const citations = Array.isArray(data.citations) ? data.citations.length : 0;
    // Assert : au moins 1 citation, et l'answer contient "7 260" ou "7260" ou "7'260"
    // (plafond pilier 3a salarié 2026 — valeur exacte 2026).
    const answerStr = typeof data.answer === "string" ? data.answer : "";
    const hasPlafond =
      answerStr.includes("7 260") ||
      answerStr.includes("7260") ||
      answerStr.includes("7'260") ||
      answerStr.includes("7 056") ||
      answerStr.includes("7'056");
    return {
      id: fixture.id,
      kind: "fiscal-pp-vd",
      pass: citations > 0 && hasPlafond,
      latencyMs: Date.now() - started,
      citations,
      agentDurationMs: data.durationMs,
      reason:
        citations === 0
          ? "no citations"
          : hasPlafond
            ? undefined
            : "answer missing pilier 3a plafond (7260/7056)",
    };
  } catch (err) {
    return {
      id: fixture.id,
      kind: "fiscal-pp-vd",
      pass: false,
      latencyMs: Date.now() - started,
      reason: err instanceof Error ? err.message : "unknown error",
    };
  }
}

async function runFiscalPpFrQuestion(
  fixture: (typeof fiscalPpFrQuestions)[number],
): Promise<TestResult> {
  const started = Date.now();
  try {
    const { data } = await http.post("/agents/fiscal-pp-fr/ask", {
      question: fixture.question,
      context: fixture.context,
    });
    const citations = Array.isArray(data.citations) ? data.citations.length : 0;
    // Assert : au moins 1 citation, et l'answer contient "7 260" ou "7260" ou "7'260"
    // (plafond pilier 3a salarié 2026).
    const answerStr = typeof data.answer === "string" ? data.answer : "";
    const hasPlafond =
      answerStr.includes("7 260") ||
      answerStr.includes("7260") ||
      answerStr.includes("7'260") ||
      answerStr.includes("7 056") ||
      answerStr.includes("7'056");
    return {
      id: fixture.id,
      kind: "fiscal-pp-fr",
      pass: citations > 0 && hasPlafond,
      latencyMs: Date.now() - started,
      citations,
      agentDurationMs: data.durationMs,
      reason:
        citations === 0
          ? "no citations"
          : hasPlafond
            ? undefined
            : "answer missing pilier 3a plafond (7260/7056)",
    };
  } catch (err) {
    return {
      id: fixture.id,
      kind: "fiscal-pp-fr",
      pass: false,
      latencyMs: Date.now() - started,
      reason: err instanceof Error ? err.message : "unknown error",
    };
  }
}

// ── Wizard GE form generation (session 17) ─────────────

async function runGeTaxpayerWizard(): Promise<TestResult> {
  const started = Date.now();
  try {
    const { data } = await http.post("/forms/ge-declaration-pp", {
      year: 2026,
      draft: {
        step1: { firstName: "Jean", lastName: "Test", commune: "Genève", civilStatus: "married" },
        step2: { revenuSalaire: 85000, salaireBrut: 85000 },
        step3: {},
        step4: { pilier3a: 7260 },
      },
    });
    const pdfB64 = data.pdf as string;
    const pdfBytes = Buffer.from(pdfB64, "base64");
    const formId = data.form?.formId as string | undefined;
    const hasGe = formId === "GE-declaration-pp";
    const noValais = !pdfBytes.toString("latin1").includes("Valais");
    const ok = pdfBytes.length > 2000 && hasGe && noValais;
    return {
      id: "tx-3-ge-wizard-form",
      kind: "taxpayer",
      pass: ok,
      latencyMs: Date.now() - started,
      reason: ok
        ? undefined
        : `bytes=${pdfBytes.length}, formId=${formId}, noValais=${noValais}`,
    };
  } catch (err) {
    return {
      id: "tx-3-ge-wizard-form",
      kind: "taxpayer",
      pass: false,
      latencyMs: Date.now() - started,
      reason: err instanceof Error ? err.message : "unknown error",
    };
  }
}

// ── Wizard VD draft submit (session 19) ─────────────────

/**
 * Fixture: taxpayer-vd-1-draft-submit
 * Crée un draft VD minimal via submit-vd, assert : HTTP 200 + pdf présent
 */
async function runVdTaxpayerDraftSubmit(): Promise<TestResult> {
  const started = Date.now();
  try {
    const { data } = await http.post("/taxpayers/draft/submit-vd", {
      fiscalYear: 2026,
    });
    const pdfB64 = data.pdf as string;
    const pdfBytes = Buffer.from(pdfB64, "base64");
    const formId = data.form?.formId as string | undefined;
    const hasVd = formId === "VD-declaration-pp";
    const ok = pdfBytes.length > 2000 && hasVd && !!data.streamId;
    return {
      id: "taxpayer-vd-1-draft-submit",
      kind: "taxpayer",
      pass: ok,
      latencyMs: Date.now() - started,
      reason: ok
        ? undefined
        : `bytes=${pdfBytes.length}, formId=${formId}, streamId=${data.streamId ?? "MISSING"}`,
    };
  } catch (err) {
    return {
      id: "taxpayer-vd-1-draft-submit",
      kind: "taxpayer",
      pass: false,
      latencyMs: Date.now() - started,
      reason: err instanceof Error ? err.message : "unknown error",
    };
  }
}

// ── Main ───────────────────────────────────────────────

async function main(): Promise<void> {
  const started = Date.now();
  const results: TestResult[] = [];

  console.log(`[qa-lexa] BASE_URL=${BASE_URL} user=${QA_EMAIL}`);
  console.log(
    `[qa-lexa] fixtures: ${classifyFixtures.length} classify + ${tvaQuestions.length} tva + ${fiscalPpQuestions.length} fiscal-pp-vs + ${fiscalPpGeQuestions.length} fiscal-pp-ge + ${fiscalPpVdQuestions.length} fiscal-pp-vd + ${fiscalPpFrQuestions.length} fiscal-pp-fr`,
  );

  // Health gate (public)
  try {
    const { data } = await http.get("/health");
    if (!data.ok) {
      throw new Error("backend health not ok");
    }
  } catch (err) {
    console.error("[qa-lexa] backend unreachable:", err);
    process.exit(2);
  }

  // Auth gate : login d'abord, les routes sensibles exigent un Bearer token
  // (session 14). Exit 2 si le user qa n'est pas seed.
  console.log(`[qa-lexa] logging in as ${QA_EMAIL}…`);
  await loginQaUser();
  console.log(`[qa-lexa] auth OK, token acquired`);

  // Sequential runs (Ollama is single-parallel sur Spark)
  for (const f of classifyFixtures) {
    const r = await runClassify(f);
    results.push(r);
    console.log(
      `  ${r.pass ? "✓" : "✗"} ${r.id}  ${r.latencyMs}ms  cites=${r.citations ?? "?"}  ${r.reason ?? ""}`,
    );
  }
  for (const f of tvaQuestions) {
    const r = await runTvaQuestion(f);
    results.push(r);
    console.log(
      `  ${r.pass ? "✓" : "✗"} ${r.id}  ${r.latencyMs}ms  cites=${r.citations ?? "?"}  ${r.reason ?? ""}`,
    );
  }
  for (const f of fiscalPpQuestions) {
    const r = await runFiscalPpQuestion(f);
    results.push(r);
    console.log(
      `  ${r.pass ? "✓" : "✗"} ${r.id}  ${r.latencyMs}ms  cites=${r.citations ?? "?"}  ${r.reason ?? ""}`,
    );
  }

  // Fiscal PP Genève (session 16)
  for (const f of fiscalPpGeQuestions) {
    const r = await runFiscalPpGeQuestion(f);
    results.push(r);
    console.log(
      `  ${r.pass ? "✓" : "✗"} ${r.id}  ${r.latencyMs}ms  cites=${r.citations ?? "?"}  ${r.reason ?? ""}`,
    );
  }

  // Fiscal PP Vaud (session 18)
  for (const f of fiscalPpVdQuestions) {
    const r = await runFiscalPpVdQuestion(f);
    results.push(r);
    console.log(
      `  ${r.pass ? "✓" : "✗"} ${r.id}  ${r.latencyMs}ms  cites=${r.citations ?? "?"}  ${r.reason ?? ""}`,
    );
  }

  // Fiscal PP Fribourg (session 21)
  for (const f of fiscalPpFrQuestions) {
    const r = await runFiscalPpFrQuestion(f);
    results.push(r);
    console.log(
      `  ${r.pass ? "✓" : "✗"} ${r.id}  ${r.latencyMs}ms  cites=${r.citations ?? "?"}  ${r.reason ?? ""}`,
    );
  }

  // Taxpayer wizard (session 15)
  const r1 = await runTaxpayerDraftCreate();
  results.push(r1);
  console.log(
    `  ${r1.pass ? "✓" : "✗"} ${r1.id}  ${r1.latencyMs}ms  ${r1.reason ?? ""}`,
  );
  const r2 = await runTaxpayerDraftSubmit();
  results.push(r2);
  console.log(
    `  ${r2.pass ? "✓" : "✗"} ${r2.id}  ${r2.latencyMs}ms  ${r2.reason ?? ""}`,
  );

  // Wizard GE — form generation (session 17)
  const r3 = await runGeTaxpayerWizard();
  results.push(r3);
  console.log(
    `  ${r3.pass ? "✓" : "✗"} ${r3.id}  ${r3.latencyMs}ms  ${r3.reason ?? ""}`,
  );

  // Wizard VD — draft submit (session 19)
  const r4 = await runVdTaxpayerDraftSubmit();
  results.push(r4);
  console.log(
    `  ${r4.pass ? "✓" : "✗"} ${r4.id}  ${r4.latencyMs}ms  ${r4.reason ?? ""}`,
  );

  const totalMs = Date.now() - started;
  const pass = results.filter((r) => r.pass).length;
  const fail = results.length - pass;
  const byKind = (k: TestResult["kind"]) =>
    results.filter((r) => r.kind === k);
  const avg = (arr: TestResult[]) =>
    arr.length ? Math.round(arr.reduce((s, r) => s + r.latencyMs, 0) / arr.length) : 0;

  const summary = {
    baseUrl: BASE_URL,
    totalMs,
    total: results.length,
    pass,
    fail,
    passRate: results.length ? Math.round((pass / results.length) * 100) : 0,
    byKind: {
      classify: { total: byKind("classify").length, passed: byKind("classify").filter((r) => r.pass).length, avgLatencyMs: avg(byKind("classify")) },
      tva: { total: byKind("tva").length, passed: byKind("tva").filter((r) => r.pass).length, avgLatencyMs: avg(byKind("tva")) },
      "fiscal-pp-vs": { total: byKind("fiscal-pp-vs").length, passed: byKind("fiscal-pp-vs").filter((r) => r.pass).length, avgLatencyMs: avg(byKind("fiscal-pp-vs")) },
      "fiscal-pp-ge": { total: byKind("fiscal-pp-ge").length, passed: byKind("fiscal-pp-ge").filter((r) => r.pass).length, avgLatencyMs: avg(byKind("fiscal-pp-ge")) },
      "fiscal-pp-vd": { total: byKind("fiscal-pp-vd").length, passed: byKind("fiscal-pp-vd").filter((r) => r.pass).length, avgLatencyMs: avg(byKind("fiscal-pp-vd")) },
      "fiscal-pp-fr": { total: byKind("fiscal-pp-fr").length, passed: byKind("fiscal-pp-fr").filter((r) => r.pass).length, avgLatencyMs: avg(byKind("fiscal-pp-fr")) },
      taxpayer: { total: byKind("taxpayer").length, passed: byKind("taxpayer").filter((r) => r.pass).length, avgLatencyMs: avg(byKind("taxpayer")) },
    },
    failures: results.filter((r) => !r.pass).map((r) => ({ id: r.id, kind: r.kind, reason: r.reason })),
    generatedAt: new Date().toISOString(),
  };

  console.log("\n[qa-lexa] SUMMARY");
  console.log(JSON.stringify(summary, null, 2));

  if (fail > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[qa-lexa] crash:", err);
  process.exit(2);
});
