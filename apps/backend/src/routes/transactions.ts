import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { eventStore } from "../events/EventStore.js";
import { classifierAgent } from "../agents/classifier/ClassifierAgent.js";
import { query } from "../db/postgres.js";

export const transactionsRouter = Router();

/**
 * Lexa default tenant — for now a single hardcoded tenant.
 * Will be replaced by SSO-provided tenant_id from Swigs Hub (session 08+).
 */
const DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001";

const IngestSchema = z.object({
  date: z.string(),
  description: z.string().min(3).max(500),
  amount: z.number(),
  currency: z.string().length(3).default("CHF"),
  counterpartyIban: z.string().optional(),
  source: z.enum(["camt053", "ocr", "manual", "swigs-pro"]).default("manual"),
  tenantId: z.string().uuid().default(DEFAULT_TENANT_ID),
});

/**
 * POST /transactions
 * Full event-sourced flow:
 *   1. Append TransactionIngested event
 *   2. Classify via ClassifierAgent
 *   3. Append TransactionClassified event linked to same stream
 *   4. Return transaction + classification + stream_id
 */
transactionsRouter.post("/", async (req, res) => {
  const parsed = IngestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid body", details: parsed.error.flatten() });
  }

  const { tenantId, source, date, description, amount, currency, counterpartyIban } = parsed.data;
  const streamId = randomUUID();

  try {
    // Step 1 — ingest event
    const ingestedEvent = await eventStore.append({
      tenantId,
      streamId,
      event: {
        type: "TransactionIngested",
        payload: {
          source,
          date,
          description,
          amount,
          currency,
          counterpartyIban,
        },
      },
      metadata: { requestId: req.header("x-request-id") ?? randomUUID() },
    });

    // Step 2 — classify
    const classification = await classifierAgent.classify({
      date,
      description,
      amount,
      currency,
      counterpartyIban,
    });

    // Step 3 — classified event
    const classifiedEvent = await eventStore.append({
      tenantId,
      streamId,
      event: {
        type: "TransactionClassified",
        payload: {
          transactionStreamId: streamId,
          agent: "classifier",
          model: "lexa-classifier",
          confidence: classification.confidence,
          debitAccount: classification.debitAccount,
          creditAccount: classification.creditAccount,
          amountHt: classification.amountHt,
          amountTtc: classification.amountTtc,
          tvaRate: classification.tvaRate,
          tvaCode: classification.tvaCode,
          costCenter: classification.costCenter,
          reasoning: classification.reasoning,
          citations: classification.citations,
          alternatives: classification.alternatives,
        },
      },
      metadata: { durationMs: classification.durationMs },
    });

    // Step 4 — persist ai_decision trace for audit
    await query(
      `INSERT INTO ai_decisions
       (event_id, tenant_id, agent, model, confidence, reasoning, citations, alternatives, duration_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9)`,
      [
        classifiedEvent.id,
        tenantId,
        "classifier",
        "lexa-classifier",
        classification.confidence,
        classification.reasoning,
        JSON.stringify(classification.citations),
        JSON.stringify(classification.alternatives),
        classification.durationMs,
      ],
    );

    res.status(201).json({
      streamId,
      tenantId,
      events: {
        ingested: { id: ingestedEvent.id, sequence: ingestedEvent.sequence },
        classified: { id: classifiedEvent.id, sequence: classifiedEvent.sequence },
      },
      transaction: {
        date,
        description,
        amount,
        currency,
        counterpartyIban,
        source,
      },
      classification: {
        debitAccount: classification.debitAccount,
        creditAccount: classification.creditAccount,
        amountHt: classification.amountHt,
        amountTtc: classification.amountTtc,
        tvaRate: classification.tvaRate,
        tvaCode: classification.tvaCode,
        confidence: classification.confidence,
        reasoning: classification.reasoning,
        citations: classification.citations,
      },
      performance: {
        classifierMs: classification.durationMs,
      },
    });
  } catch (err) {
    console.error("Transaction flow error:", err);
    res.status(500).json({
      error: "transaction flow failed",
      message: (err as Error).message,
      streamId,
    });
  }
});

/**
 * GET /transactions/:streamId
 * Reads the full event history for a transaction stream.
 */
transactionsRouter.get("/:streamId", async (req, res) => {
  const streamId = req.params.streamId;
  if (!streamId || !/^[0-9a-f-]{36}$/i.test(streamId)) {
    return res.status(400).json({ error: "invalid streamId" });
  }

  const events = await eventStore.readStream({
    tenantId: DEFAULT_TENANT_ID,
    streamId,
  });

  if (events.length === 0) {
    return res.status(404).json({ error: "stream not found" });
  }

  res.json({
    streamId,
    eventCount: events.length,
    events: events.map((e) => ({
      id: e.id,
      sequence: e.sequence,
      type: e.type,
      payload: e.payload,
      occurredAt: e.occurredAt,
    })),
  });
});

/**
 * GET /transactions/stats/:tenantId?
 * Basic stats: event count per type.
 */
transactionsRouter.get("/stats/summary", async (_req, res) => {
  const result = await query<{ type: string; count: string }>(
    `SELECT type, COUNT(*)::text AS count
     FROM events
     WHERE tenant_id = $1
     GROUP BY type
     ORDER BY type`,
    [DEFAULT_TENANT_ID],
  );

  const byType: Record<string, number> = {};
  for (const row of result.rows) {
    byType[row.type] = Number(row.count);
  }

  const total = await eventStore.count(DEFAULT_TENANT_ID);

  res.json({
    tenantId: DEFAULT_TENANT_ID,
    total,
    byType,
  });
});
