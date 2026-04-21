import { embedder } from "../../rag/EmbedderClient.js";
import { qdrant, type QdrantHit } from "../../rag/QdrantClient.js";
import { ollama } from "../../llm/OllamaClient.js";
import { query } from "../../db/postgres.js";

export type LexaQuery = {
  question: string;
  tenantId: string;
  year?: number;
};

export type LexaAnswer = {
  answer: string;
  citations: Array<{
    law: string;
    article: string;
    heading?: string;
    score: number;
    url?: string;
  }>;
  durationMs: number;
  model: string;
};

type LedgerStats = {
  txCount: number;
  totalDebit: number;
  totalCredit: number;
};

type TopAccount = {
  account: string;
  totalDebit: number;
  totalCredit: number;
  balance: number;
};

type DraftState = Record<string, unknown> | null;

async function fetchLedgerContext(
  tenantId: string,
  year: number,
): Promise<{ stats: LedgerStats; topAccounts: TopAccount[]; draftState: DraftState }> {
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  const [statsResult, topResult, draftResult] = await Promise.all([
    query<{ tx_count: string; total_debit: string; total_credit: string }>(
      `SELECT
         COUNT(DISTINCT stream_id) AS tx_count,
         COALESCE(SUM(amount) FILTER (WHERE line_type = 'debit'), 0)  AS total_debit,
         COALESCE(SUM(amount) FILTER (WHERE line_type = 'credit'), 0) AS total_credit
       FROM ledger_entries
       WHERE tenant_id = $1
         AND (transaction_date IS NULL OR transaction_date BETWEEN $2 AND $3)`,
      [tenantId, yearStart, yearEnd],
    ),
    query<{ account: string; total_debit: string; total_credit: string; balance: string }>(
      `SELECT
         account,
         COALESCE(SUM(amount) FILTER (WHERE line_type = 'debit'), 0)  AS total_debit,
         COALESCE(SUM(amount) FILTER (WHERE line_type = 'credit'), 0) AS total_credit,
         COALESCE(SUM(amount) FILTER (WHERE line_type = 'debit'), 0)
           - COALESCE(SUM(amount) FILTER (WHERE line_type = 'credit'), 0) AS balance
       FROM ledger_entries
       WHERE tenant_id = $1
         AND (transaction_date IS NULL OR transaction_date BETWEEN $2 AND $3)
       GROUP BY account
       ORDER BY ABS(
         COALESCE(SUM(amount) FILTER (WHERE line_type = 'debit'), 0)
           - COALESCE(SUM(amount) FILTER (WHERE line_type = 'credit'), 0)
       ) DESC
       LIMIT 10`,
      [tenantId, yearStart, yearEnd],
    ),
    query<{ state: DraftState }>(
      `SELECT state FROM taxpayer_drafts WHERE tenant_id = $1 AND fiscal_year = $2 LIMIT 1`,
      [tenantId, year],
    ),
  ]);

  const raw = statsResult.rows[0];
  const stats: LedgerStats = {
    txCount: parseInt(raw?.tx_count ?? "0", 10),
    totalDebit: parseFloat(raw?.total_debit ?? "0"),
    totalCredit: parseFloat(raw?.total_credit ?? "0"),
  };

  const topAccounts: TopAccount[] = topResult.rows.map((r) => ({
    account: r.account,
    totalDebit: parseFloat(r.total_debit),
    totalCredit: parseFloat(r.total_credit),
    balance: parseFloat(r.balance),
  }));

  const draftState = draftResult.rows[0]?.state ?? null;

  return { stats, topAccounts, draftState };
}

function buildAccountingContext(
  tenantId: string,
  year: number,
  stats: LedgerStats,
  topAccounts: TopAccount[],
  draftState: DraftState,
): string {
  const fmt = (n: number) =>
    new Intl.NumberFormat("fr-CH", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

  const accountLines = topAccounts
    .map((a) => `  ${a.account} solde ${fmt(a.balance)} CHF (débit ${fmt(a.totalDebit)} / crédit ${fmt(a.totalCredit)})`)
    .join("\n");

  const draftLines =
    draftState !== null
      ? Object.entries(draftState as Record<string, unknown>)
          .map(([step, fields]) => {
            if (typeof fields !== "object" || fields === null) return null;
            const pairs = Object.entries(fields as Record<string, unknown>)
              .filter(([, v]) => v !== undefined && v !== null && v !== "")
              .map(([k, v]) => `${k}=${String(v)}`)
              .join(", ");
            return pairs ? `  ${step}: ${pairs}` : null;
          })
          .filter(Boolean)
          .join("\n")
      : "  Aucun draft fiscal trouvé pour cette année.";

  return `CONTEXTE COMPTABLE (tenant ${tenantId}, année ${year}):
- Transactions: ${stats.txCount} | Total débit: ${fmt(stats.totalDebit)} CHF | Total crédit: ${fmt(stats.totalCredit)} CHF
- Top comptes par solde absolu:
${accountLines || "  Aucune écriture trouvée."}
- Draft fiscal PP:
${draftLines}`;
}

export class LexaAgent {
  private readonly model = "lexa-reasoning";

  async ask(query_: LexaQuery): Promise<LexaAnswer> {
    const started = Date.now();
    const year = query_.year ?? new Date().getFullYear();

    const [{ stats, topAccounts, draftState }, qVec] = await Promise.all([
      fetchLedgerContext(query_.tenantId, year),
      embedder.embedOne(query_.question),
    ]);

    const hits = await qdrant.search({ vector: qVec, limit: 5 });
    const contextLines = hits.map((h: QdrantHit, i: number) => {
      const p = h.payload;
      const src = p.rs ? `[${p.law} (RS ${p.rs}) ${p.article}]` : `[${p.law} ${p.article}]`;
      return `${i + 1}. ${src} ${p.heading ?? ""}\n${p.text.slice(0, 600)}`;
    });
    const ragContext = contextLines.join("\n\n---\n\n");

    const accountingContext = buildAccountingContext(
      query_.tenantId,
      year,
      stats,
      topAccounts,
      draftState,
    );

    const prompt = `${accountingContext}

SOURCES JURIDIQUES PERTINENTES:
${ragContext || "Aucune source RAG pertinente trouvée."}

QUESTION: ${query_.question}

Réponds de manière concise et précise. Si la question porte sur des chiffres comptables, utilise uniquement les données du contexte comptable ci-dessus. Si elle porte sur une règle fiscale, cite les articles pertinents.

RÉPONSE:`;

    const { response } = await ollama.generate({
      model: this.model,
      prompt,
      temperature: 0.2,
      numCtx: 16384,
      numPredict: 800,
    });

    const citations = hits.map((h: QdrantHit) => ({
      law: h.payload.law,
      article: h.payload.article,
      heading: h.payload.heading,
      score: h.score,
      url: h.payload.url,
    }));

    return {
      answer: response.trim(),
      citations,
      durationMs: Date.now() - started,
      model: this.model,
    };
  }
}

export const lexaAgent = new LexaAgent();
