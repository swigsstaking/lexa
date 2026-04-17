/**
 * One-shot: reclassifier les TransactionIngested orphelines (sans TransactionClassified).
 *
 * Cause typique: jobs BullMQ perdus lors d'un restart / bug de queue pendant upload CAMT.
 *
 * Usage: npx tsx apps/backend/src/scripts/backfill-classifier.ts <tenantId>
 */
import { config } from "../config/index.js";
import { query, queryAsTenant } from "../db/postgres.js";
import { eventStore } from "../events/EventStore.js";
import { ClassifierAgent } from "../agents/classifier/ClassifierAgent.js";

async function main() {
  const tenantId = process.argv[2];
  if (!tenantId) {
    console.error("Usage: tsx backfill-classifier.ts <tenantId>");
    process.exit(1);
  }

  console.log(`[backfill] scanning tenant ${tenantId}...`);

  // Find TransactionIngested without matching TransactionClassified on same streamId
  const { rows: orphans } = await queryAsTenant<{
    id: string;
    stream_id: string;
    payload: Record<string, unknown>;
    metadata: Record<string, unknown>;
  }>(
    tenantId,
    `SELECT e.id, e.stream_id, e.payload, e.metadata
     FROM events e
     WHERE e.tenant_id = $1
       AND e.type = 'TransactionIngested'
       AND NOT EXISTS (
         SELECT 1 FROM events c
         WHERE c.tenant_id = e.tenant_id
           AND c.stream_id = e.stream_id
           AND c.type = 'TransactionClassified'
       )
     ORDER BY e.occurred_at ASC`,
    [tenantId],
  );

  console.log(`[backfill] found ${orphans.length} orphan transactions`);
  if (orphans.length === 0) {
    process.exit(0);
  }

  const agent = new ClassifierAgent();
  let done = 0;
  let failed = 0;

  for (const row of orphans) {
    const p = row.payload as {
      description?: string;
      amount?: number | string;
      currency?: string;
      date?: string;
      counterpartyIban?: string;
    };
    try {
      const classification = await agent.classify({
        date: p.date ?? new Date().toISOString().slice(0, 10),
        description: p.description ?? "",
        amount: typeof p.amount === "string" ? Number(p.amount) : (p.amount ?? 0),
        currency: p.currency ?? "CHF",
        counterpartyIban: p.counterpartyIban,
      });

      const cl = classification;

      const classifiedEvent = await eventStore.append({
        tenantId,
        streamId: row.stream_id,
        event: {
          type: "TransactionClassified",
          payload: {
            transactionStreamId: row.stream_id,
            agent: "classifier",
            model: config.MODEL_CLASSIFIER,
            confidence: cl.confidence,
            debitAccount: cl.debitAccount,
            creditAccount: cl.creditAccount,
            amountHt: cl.amountHt,
            amountTtc: cl.amountTtc,
            tvaRate: cl.tvaRate,
            tvaCode: cl.tvaCode,
            costCenter: cl.costCenter,
            reasoning: cl.reasoning,
            citations: cl.citations,
            alternatives: cl.alternatives,
          },
        },
        metadata: { durationMs: cl.durationMs, backfill: true },
      });

      await queryAsTenant(
        tenantId,
        `INSERT INTO ai_decisions
         (event_id, tenant_id, agent, model, confidence, reasoning, citations, alternatives, duration_ms)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9)`,
        [
          classifiedEvent.id,
          tenantId,
          "classifier",
          config.MODEL_CLASSIFIER,
          cl.confidence,
          cl.reasoning,
          JSON.stringify(cl.citations),
          JSON.stringify(cl.alternatives),
          cl.durationMs,
        ],
      );

      done++;
      console.log(`[backfill] ${done}/${orphans.length} streamId=${row.stream_id} debit=${cl.debitAccount} credit=${cl.creditAccount}`);
    } catch (err) {
      failed++;
      console.warn(`[backfill] FAILED streamId=${row.stream_id}: ${(err as Error).message}`);
    }
  }

  console.log(`[backfill] done: classified=${done} failed=${failed}`);

  // Refresh matview
  await query("REFRESH MATERIALIZED VIEW CONCURRENTLY ledger_entries", []);
  console.log(`[backfill] ledger_entries refreshed`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
