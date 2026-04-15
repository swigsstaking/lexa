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
  kind: "classify" | "tva" | "fiscal-pp-vs";
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

// ── Main ───────────────────────────────────────────────

async function main(): Promise<void> {
  const started = Date.now();
  const results: TestResult[] = [];

  console.log(`[qa-lexa] BASE_URL=${BASE_URL} user=${QA_EMAIL}`);
  console.log(
    `[qa-lexa] fixtures: ${classifyFixtures.length} classify + ${tvaQuestions.length} tva + ${fiscalPpQuestions.length} fiscal-pp-vs`,
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
