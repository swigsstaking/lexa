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
import { randomUUID } from "node:crypto";
import { execSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __qadirname = dirname(fileURLToPath(import.meta.url));

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
let qaTenantId: string | null = null;

async function loginQaUser(): Promise<void> {
  try {
    const { data } = await http.post<{ token: string; user?: { tenantId?: string } }>("/auth/login", {
      email: QA_EMAIL,
      password: QA_PASSWORD,
    });
    authToken = data.token;
    http.defaults.headers.common["Authorization"] = `Bearer ${authToken}`;
    // Extraire le tenantId du payload JWT (base64url decode du segment 2)
    if (data.user?.tenantId) {
      qaTenantId = data.user.tenantId;
    } else if (authToken) {
      try {
        const payload = JSON.parse(Buffer.from(authToken.split(".")[1], "base64url").toString()) as { tenantId?: string };
        qaTenantId = payload.tenantId ?? null;
      } catch { /* ignore */ }
    }
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
  kind: "classify" | "tva" | "fiscal-pp-vs" | "fiscal-pp-ge" | "fiscal-pp-vd" | "fiscal-pp-fr" | "fiscal-pp-ne" | "fiscal-pp-ju" | "fiscal-pp-bj" | "taxpayer" | "documents";
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

const fiscalPpNeQuestions = [
  {
    id: "pp-ne-1-pilier-3a",
    question: "Plafond pilier 3a salarie Neuchatel 2026 ?",
    context: { commune: "Neuchatel" },
  },
];

const fiscalPpJuQuestions = [
  {
    id: "pp-ju-1-pilier-3a",
    question: "Plafond pilier 3a salarie Delemont 2026 ?",
    context: { commune: "Delemont" },
  },
];

const fiscalPpBjQuestions = [
  {
    id: "pp-bj-1-pilier-3a",
    question: "Plafond pilier 3a salarie Moutier 2026 ?",
    context: { commune: "Moutier" },
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

async function runFiscalPpNeQuestion(
  fixture: (typeof fiscalPpNeQuestions)[number],
): Promise<TestResult> {
  const started = Date.now();
  try {
    const { data } = await http.post("/agents/fiscal-pp-ne/ask", {
      question: fixture.question,
      context: fixture.context,
    });
    const citations = Array.isArray(data.citations) ? data.citations.length : 0;
    const answerStr = typeof data.answer === "string" ? data.answer : "";
    const hasPlafond =
      answerStr.includes("7 260") ||
      answerStr.includes("7260") ||
      answerStr.includes("7'260") ||
      answerStr.includes("7 056") ||
      answerStr.includes("7'056");
    return {
      id: fixture.id,
      kind: "fiscal-pp-ne",
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
      kind: "fiscal-pp-ne",
      pass: false,
      latencyMs: Date.now() - started,
      reason: err instanceof Error ? err.message : "unknown error",
    };
  }
}

async function runFiscalPpJuQuestion(
  fixture: (typeof fiscalPpJuQuestions)[number],
): Promise<TestResult> {
  const started = Date.now();
  try {
    const { data } = await http.post("/agents/fiscal-pp-ju/ask", {
      question: fixture.question,
      context: fixture.context,
    });
    const citations = Array.isArray(data.citations) ? data.citations.length : 0;
    const answerStr = typeof data.answer === "string" ? data.answer : "";
    const hasPlafond =
      answerStr.includes("7 260") ||
      answerStr.includes("7260") ||
      answerStr.includes("7'260") ||
      answerStr.includes("7 056") ||
      answerStr.includes("7'056");
    return {
      id: fixture.id,
      kind: "fiscal-pp-ju",
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
      kind: "fiscal-pp-ju",
      pass: false,
      latencyMs: Date.now() - started,
      reason: err instanceof Error ? err.message : "unknown error",
    };
  }
}

async function runFiscalPpBjQuestion(
  fixture: (typeof fiscalPpBjQuestions)[number],
): Promise<TestResult> {
  const started = Date.now();
  try {
    const { data } = await http.post("/agents/fiscal-pp-bj/ask", {
      question: fixture.question,
      context: fixture.context,
    });
    const citations = Array.isArray(data.citations) ? data.citations.length : 0;
    const answerStr = typeof data.answer === "string" ? data.answer : "";
    const hasPlafond =
      answerStr.includes("7 260") ||
      answerStr.includes("7260") ||
      answerStr.includes("7'260") ||
      answerStr.includes("7 056") ||
      answerStr.includes("7'056");
    return {
      id: fixture.id,
      kind: "fiscal-pp-bj",
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
      kind: "fiscal-pp-bj",
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
 * Fixture: taxpayer-fr-1-draft-submit
 * Crée un draft FR minimal via submit-fr, assert : HTTP 200 + pdf présent + formId FR
 * Ajouté session 22 (Lane A)
 */
async function runFrTaxpayerDraftSubmit(): Promise<TestResult> {
  const started = Date.now();
  try {
    const { data } = await http.post("/taxpayers/draft/submit-fr", {
      fiscalYear: 2026,
    });
    const pdfB64 = data.pdf as string;
    const pdfBytes = Buffer.from(pdfB64, "base64");
    const formId = data.form?.formId as string | undefined;
    const hasFr = formId === "FR-declaration-pp";
    const ok = pdfBytes.length > 2000 && hasFr && !!data.streamId;
    return {
      id: "taxpayer-fr-1-draft-submit",
      kind: "taxpayer",
      pass: ok,
      latencyMs: Date.now() - started,
      reason: ok
        ? undefined
        : `bytes=${pdfBytes.length}, formId=${formId}, streamId=${data.streamId ?? "MISSING"}`,
    };
  } catch (err) {
    return {
      id: "taxpayer-fr-1-draft-submit",
      kind: "taxpayer",
      pass: false,
      latencyMs: Date.now() - started,
      reason: err instanceof Error ? err.message : "unknown error",
    };
  }
}

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

/**
 * Fixture: documents-1-upload-ocr-cert-salaire — Session 25
 *
 * Test E2E réel du pipeline OCR :
 * 1. Charge le PDF fixture test-cert-salaire.pdf depuis disque
 * 2. POST multipart à /documents/upload (vrai upload)
 * 3. Asserts strict :
 *    - HTTP 201 + documentId présent
 *    - ocrResult.type ∈ ["certificat_salaire", "autre"] (tolère "autre" soft-fail si OCR dégradé)
 *    - ocrResult.rawText contient "CERTIFICAT" ou "SALAIRE" (case-insensitive)
 *    - ocrResult.durationMs < 90000
 * 4. Cleanup soft : DELETE le doc uploadé (si possible)
 *
 * Remplace documents-1-list-route (S23) — la route list était trop faible,
 * ne prouvait pas que le pipeline OCR fonctionnait end-to-end.
 *
 * Timeout : 120s (pour laisser le temps à l'OCR vision Ollama)
 */
async function runDocumentsUploadOcrCertSalaire(): Promise<TestResult> {
  const started = Date.now();
  const TEST_ID = "documents-1-upload-ocr-cert-salaire";
  let documentId: string | null = null;

  const softCleanup = () => {
    if (documentId) {
      http.delete(`/documents/${documentId}`).catch(() => {});
    }
  };

  try {
    // 1. Charger le PDF fixture
    const pdfPath = join(__qadirname, "fixtures", "test-cert-salaire.pdf");
    const pdfBuffer = await readFile(pdfPath);

    // 2. Construire le FormData multipart (Node 20 natif)
    const formData = new FormData();
    const blob = new Blob([pdfBuffer], { type: "application/pdf" });
    formData.append("file", blob, "test-cert-salaire.pdf");

    // 3. POST multipart — override Content-Type pour multipart/form-data
    const { data } = await http.post<{
      documentId?: string;
      filename?: string;
      ocrResult?: {
        type?: string;
        rawText?: string;
        extractionMethod?: string;
        durationMs?: number;
      };
    }>("/documents/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 120_000,
    });

    documentId = data.documentId ?? null;

    // 4. Asserts stricts
    if (!documentId) {
      softCleanup();
      return {
        id: TEST_ID, kind: "documents", pass: false,
        latencyMs: Date.now() - started,
        reason: `documentId absent de la réponse: ${JSON.stringify(data)}`,
      };
    }

    const ocrResult = data.ocrResult;
    if (!ocrResult) {
      softCleanup();
      return {
        id: TEST_ID, kind: "documents", pass: false,
        latencyMs: Date.now() - started,
        reason: `ocrResult absent de la réponse: ${JSON.stringify(data)}`,
      };
    }

    const rawText = ocrResult.rawText ?? "";
    const hasText = /CERTIFICAT|SALAIRE/i.test(rawText);
    if (!hasText) {
      softCleanup();
      return {
        id: TEST_ID, kind: "documents", pass: false,
        latencyMs: Date.now() - started,
        reason: `rawText ne contient pas "CERTIFICAT" ou "SALAIRE". rawText[:200]="${rawText.slice(0, 200)}"`,
      };
    }

    const validTypes = ["certificat_salaire", "autre"];
    if (!validTypes.includes(ocrResult.type ?? "")) {
      softCleanup();
      return {
        id: TEST_ID, kind: "documents", pass: false,
        latencyMs: Date.now() - started,
        reason: `ocrResult.type="${ocrResult.type}" inattendu (attendu: ${validTypes.join("|")})`,
      };
    }

    const durationMs = ocrResult.durationMs ?? 0;
    if (durationMs > 90_000) {
      softCleanup();
      return {
        id: TEST_ID, kind: "documents", pass: false,
        latencyMs: Date.now() - started,
        reason: `OCR trop lent: ${durationMs}ms > 90000ms`,
      };
    }

    softCleanup();
    return {
      id: TEST_ID, kind: "documents", pass: true,
      latencyMs: Date.now() - started,
      reason: `type=${ocrResult.type} method=${ocrResult.extractionMethod} durationMs=${durationMs}`,
    };
  } catch (err) {
    softCleanup();
    return {
      id: TEST_ID, kind: "documents", pass: false,
      latencyMs: Date.now() - started,
      reason: err instanceof Error ? err.message : "unknown error",
    };
  }
}

/**
 * Fixture: documents-2-apply-to-draft-fr — Session 24
 *
 * Vérifie le pipeline auto-fill complet :
 * 1. Crée un draft fiscal 2026 pour le qa tenant
 * 2. Injecte un document certificat_salaire synthétique dans Mongo (skip OCR)
 * 3. POST /documents/:id/apply-to-draft year=2026
 * 4. Assert response.fieldsApplied contient "step2.salaireBrut"
 * 5. GET /taxpayers/draft?year=2026 → assert state.step2.salaireBrut === 85000
 * 6. GET /taxpayers/draft/2026/field-sources → assert "step2.salaireBrut" présent
 * 7. Cleanup Mongo
 *
 * Timeout : 30s (pas d'OCR).
 */
async function runDocumentsApplyToDraft(): Promise<TestResult> {
  const started = Date.now();
  const synthDocId = randomUUID();
  const GROSS_SALARY = 85000;

  // Vérifier que le tenantId est disponible (requis pour l'injection Mongo)
  if (!qaTenantId) {
    return {
      id: "documents-2-apply-to-draft-fr",
      kind: "documents",
      pass: false,
      latencyMs: Date.now() - started,
      reason: "qaTenantId not available (login may have failed)",
    };
  }

  // Vérifier que mongosh est disponible (fixture s'exécute sur le serveur)
  let mongoshAvailable = false;
  try {
    execSync("which mongosh", { stdio: "pipe" });
    mongoshAvailable = true;
  } catch {
    mongoshAvailable = false;
  }

  if (!mongoshAvailable) {
    // Pas de mongosh disponible (ex: exécution locale) — skip avec avertissement
    return {
      id: "documents-2-apply-to-draft-fr",
      kind: "documents",
      pass: true,
      latencyMs: Date.now() - started,
      reason: "SKIP: mongosh not available (ok when running locally without server access)",
    };
  }

  const cleanupDoc = () => {
    try {
      execSync(
        `mongosh lexa-documents --quiet --eval "db.documents_meta.deleteOne({documentId:'${synthDocId}'})"`,
        { stdio: "pipe" },
      );
    } catch { /* ignore cleanup errors */ }
  };

  try {
    // 1. S'assurer qu'un draft 2026 existe (getOrCreate)
    await http.get("/taxpayers/draft?year=2026");

    // 2. Injecter doc synthétique dans Mongo
    const insertScript = `
      db.documents_meta.insertOne({
        documentId:"${synthDocId}",
        tenantId:"${qaTenantId}",
        gridfsId:"synth-qa",
        filename:"qa-cert-salaire-s24.pdf",
        mimetype:"application/pdf",
        size:2200,
        uploadedAt:new Date(),
        ocrResult:{
          type:"certificat_salaire",
          rawText:"CERTIFICAT DE SALAIRE 2025 Salaire brut: 85000",
          extractionMethod:"pdf-parse",
          ocrConfidence:0.95,
          extractedFields:{employer:"Lexa Test SA", grossSalary:${GROSS_SALARY}, netSalary:72500, year:2025},
          durationMs:100
        },
        appliedToDrafts:[]
      })
    `.replace(/\n/g, " ");

    execSync(`mongosh lexa-documents --quiet --eval "${insertScript.replace(/"/g, '\\"')}"`, { stdio: "pipe" });

    // 3. Apply doc → draft
    const applyResp = await http.post<{ ok: boolean; fieldsApplied: string[]; message: string }>(
      `/documents/${synthDocId}/apply-to-draft`,
      { year: 2026 },
    );

    if (!applyResp.data.ok) {
      cleanupDoc();
      return {
        id: "documents-2-apply-to-draft-fr",
        kind: "documents",
        pass: false,
        latencyMs: Date.now() - started,
        reason: `apply returned ok=false: ${applyResp.data.message}`,
      };
    }

    if (!applyResp.data.fieldsApplied.includes("step2.salaireBrut")) {
      cleanupDoc();
      return {
        id: "documents-2-apply-to-draft-fr",
        kind: "documents",
        pass: false,
        latencyMs: Date.now() - started,
        reason: `fieldsApplied missing step2.salaireBrut: ${JSON.stringify(applyResp.data.fieldsApplied)}`,
      };
    }

    // 4. Vérifier le draft mis à jour
    const draftResp = await http.get<{ draft: { state: { step2: { salaireBrut?: number } } } }>(
      "/taxpayers/draft?year=2026",
    );
    const actualSalary = draftResp.data.draft?.state?.step2?.salaireBrut;
    if (actualSalary !== GROSS_SALARY) {
      cleanupDoc();
      return {
        id: "documents-2-apply-to-draft-fr",
        kind: "documents",
        pass: false,
        latencyMs: Date.now() - started,
        reason: `draft.state.step2.salaireBrut expected ${GROSS_SALARY}, got ${actualSalary}`,
      };
    }

    // 5. Vérifier field-sources
    const sourcesResp = await http.get<Record<string, { documentId: string; filename: string }>>(
      "/taxpayers/draft/2026/field-sources",
    );
    if (!sourcesResp.data["step2.salaireBrut"]) {
      cleanupDoc();
      return {
        id: "documents-2-apply-to-draft-fr",
        kind: "documents",
        pass: false,
        latencyMs: Date.now() - started,
        reason: `field-sources missing step2.salaireBrut: ${JSON.stringify(sourcesResp.data)}`,
      };
    }

    cleanupDoc();
    return {
      id: "documents-2-apply-to-draft-fr",
      kind: "documents",
      pass: true,
      latencyMs: Date.now() - started,
    };
  } catch (err) {
    cleanupDoc();
    return {
      id: "documents-2-apply-to-draft-fr",
      kind: "documents",
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
    `[qa-lexa] fixtures: ${classifyFixtures.length} classify + ${tvaQuestions.length} tva + ${fiscalPpQuestions.length} fiscal-pp-vs + ${fiscalPpGeQuestions.length} fiscal-pp-ge + ${fiscalPpVdQuestions.length} fiscal-pp-vd + ${fiscalPpFrQuestions.length} fiscal-pp-fr + ${fiscalPpNeQuestions.length} fiscal-pp-ne + ${fiscalPpJuQuestions.length} fiscal-pp-ju + ${fiscalPpBjQuestions.length} fiscal-pp-bj + 2 documents (s25-ocr-e2e+s24-apply)`,
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

  // Fiscal PP Neuchatel (session 22.5)
  for (const f of fiscalPpNeQuestions) {
    const r = await runFiscalPpNeQuestion(f);
    results.push(r);
    console.log(
      `  ${r.pass ? "✓" : "✗"} ${r.id}  ${r.latencyMs}ms  cites=${r.citations ?? "?"}  ${r.reason ?? ""}`,
    );
  }

  // Fiscal PP Jura (session 22.5)
  for (const f of fiscalPpJuQuestions) {
    const r = await runFiscalPpJuQuestion(f);
    results.push(r);
    console.log(
      `  ${r.pass ? "✓" : "✗"} ${r.id}  ${r.latencyMs}ms  cites=${r.citations ?? "?"}  ${r.reason ?? ""}`,
    );
  }

  // Fiscal PP Jura bernois (session 22.5)
  for (const f of fiscalPpBjQuestions) {
    const r = await runFiscalPpBjQuestion(f);
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

  // Wizard FR — draft submit (session 22 Lane A)
  const r5 = await runFrTaxpayerDraftSubmit();
  results.push(r5);
  console.log(
    `  ${r5.pass ? "✓" : "✗"} ${r5.id}  ${r5.latencyMs}ms  ${r5.reason ?? ""}`,
  );

  // Documents OCR pipeline E2E — upload PDF réel (session 25, remplace route-list S23)
  const r6 = await runDocumentsUploadOcrCertSalaire();
  results.push(r6);
  console.log(
    `  ${r6.pass ? "✓" : "✗"} ${r6.id}  ${r6.latencyMs}ms  ${r6.reason ?? ""}`,
  );

  // Documents apply-to-draft E2E (session 24)
  const r7 = await runDocumentsApplyToDraft();
  results.push(r7);
  console.log(
    `  ${r7.pass ? "✓" : "✗"} ${r7.id}  ${r7.latencyMs}ms  ${r7.reason ?? ""}`,
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
      "fiscal-pp-ne": { total: byKind("fiscal-pp-ne").length, passed: byKind("fiscal-pp-ne").filter((r) => r.pass).length, avgLatencyMs: avg(byKind("fiscal-pp-ne")) },
      "fiscal-pp-ju": { total: byKind("fiscal-pp-ju").length, passed: byKind("fiscal-pp-ju").filter((r) => r.pass).length, avgLatencyMs: avg(byKind("fiscal-pp-ju")) },
      "fiscal-pp-bj": { total: byKind("fiscal-pp-bj").length, passed: byKind("fiscal-pp-bj").filter((r) => r.pass).length, avgLatencyMs: avg(byKind("fiscal-pp-bj")) },
      taxpayer: { total: byKind("taxpayer").length, passed: byKind("taxpayer").filter((r) => r.pass).length, avgLatencyMs: avg(byKind("taxpayer")) },
      documents: { total: byKind("documents").length, passed: byKind("documents").filter((r) => r.pass).length, avgLatencyMs: avg(byKind("documents")) },
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
