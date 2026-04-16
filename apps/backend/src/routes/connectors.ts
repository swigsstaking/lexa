import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { eventStore } from "../events/EventStore.js";
import { classifierAgent } from "../agents/classifier/ClassifierAgent.js";
import { query, queryAsTenant } from "../db/postgres.js";
import { requireHmac } from "../middleware/requireHmac.js";
import { config } from "../config/index.js";
import { proWebhookClient } from "../services/ProWebhookClient.js";

export const connectorsRouter = Router();

const DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001";

/**
 * BankTransaction format compatible Swigs Pro (BankTransaction.js).
 * Used by the bank email parser in swigs-workflow.
 *
 * Reference: swigs-workflow/backend/src/models/BankTransaction.js
 */
const SwigsProBankTransactionSchema = z.object({
  txId: z.string().optional(),
  amount: z.number().positive(),
  currency: z.string().length(3).default("CHF"),
  creditDebit: z.enum(["CRDT", "DBIT"]),
  counterpartyName: z.string().max(500).optional(),
  counterpartyIban: z.string().optional(),
  reference: z.string().optional(),
  unstructuredReference: z.string().optional(),
  bookingDate: z.string(),
  importFilename: z.string().optional(),
  source: z.enum(["swigs-pro-email", "swigs-pro-camt053", "manual"]).default("swigs-pro-email"),
  userId: z.string().uuid().optional(),
});

const BatchIngestSchema = z.object({
  tenantId: z.string().uuid().default(DEFAULT_TENANT_ID),
  transactions: z.array(SwigsProBankTransactionSchema).min(1).max(500),
  classify: z.boolean().default(true),
});

/**
 * POST /connectors/bank/ingest
 * Accepts a batch of Swigs Pro BankTransactions and ingests them into Lexa's
 * event store. If `classify=true`, each transaction is also classified by the
 * Lexa Classifier agent (Käfer account + TVA + citations).
 *
 * Response: per-transaction result with streamId + optional classification.
 */
connectorsRouter.post("/bank/ingest", requireHmac, async (req, res) => {
  const parsed = BatchIngestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid body", details: parsed.error.flatten() });
  }

  const { tenantId, transactions, classify } = parsed.data;
  const results: Array<{
    txId: string | undefined;
    streamId: string;
    status: "ingested" | "classified" | "failed";
    classification?: {
      debitAccount: string;
      creditAccount: string;
      tvaRate: number;
      confidence: number;
      citations: unknown;
    };
    error?: string;
  }> = [];

  for (const tx of transactions) {
    const streamId = randomUUID();
    try {
      // CRDT = entrée en banque (crédit du compte banque du client), amount positif
      // DBIT = sortie de banque (débit du compte banque du client), amount négatif
      const signedAmount = tx.creditDebit === "DBIT" ? -tx.amount : tx.amount;

      // Build enriched description (counterparty + reference for better RAG match)
      const descriptionParts = [
        tx.counterpartyName,
        tx.reference,
        tx.unstructuredReference,
      ].filter(Boolean);
      const description = descriptionParts.join(" | ") || "(no description)";

      await eventStore.append({
        tenantId,
        streamId,
        event: {
          type: "TransactionIngested",
          payload: {
            source: tx.source === "swigs-pro-email" ? "swigs-pro" : "camt053",
            date: tx.bookingDate,
            description,
            amount: signedAmount,
            currency: tx.currency,
            counterpartyIban: tx.counterpartyIban,
          },
        },
        metadata: {
          txId: tx.txId,
          counterpartyName: tx.counterpartyName,
          importFilename: tx.importFilename,
          userId: tx.userId,
          connector: "swigs-pro-bank",
        },
      });

      if (!classify) {
        results.push({ txId: tx.txId, streamId, status: "ingested" });
        continue;
      }

      const classification = await classifierAgent.classify({
        date: tx.bookingDate,
        description,
        amount: signedAmount,
        currency: tx.currency,
        counterpartyIban: tx.counterpartyIban,
      });

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

      await queryAsTenant(
        tenantId,
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

      // Session 20 : notifier Pro du résultat (fire-and-forget, ne bloque pas la réponse)
      if (config.PRO_WEBHOOK_ENABLED) {
        proWebhookClient.notify(streamId, tx.txId, classification).catch((err) => {
          console.warn("[pro-webhook] fire-and-forget failed:", (err as Error).message);
        });
      }

      results.push({
        txId: tx.txId,
        streamId,
        status: "classified",
        classification: {
          debitAccount: classification.debitAccount,
          creditAccount: classification.creditAccount,
          tvaRate: classification.tvaRate,
          confidence: classification.confidence,
          citations: classification.citations,
        },
      });
    } catch (err) {
      results.push({
        txId: tx.txId,
        streamId,
        status: "failed",
        error: (err as Error).message,
      });
    }
  }

  const ingested = results.filter((r) => r.status !== "failed").length;
  const failed = results.filter((r) => r.status === "failed").length;

  res.status(ingested > 0 ? 201 : 500).json({
    tenantId,
    summary: {
      received: transactions.length,
      ingested,
      failed,
    },
    results,
  });
});

/**
 * POST /connectors/bank/ingest/:format
 * Helper endpoints for common formats (future: CAMT.053 XML upload, CSV, etc.)
 * For now only swigs-pro-email is supported directly.
 */
connectorsRouter.get("/bank/formats", (_req, res) => {
  res.json({
    supported: [
      {
        id: "swigs-pro-email",
        description: "Swigs Pro BankTransaction format (parsed from bank emails)",
        schema: "array of {amount, creditDebit, counterpartyName, reference, bookingDate, ...}",
        endpoint: "POST /connectors/bank/ingest",
      },
    ],
    planned: [
      { id: "camt053", description: "ISO 20022 CAMT.053 XML" },
      { id: "csv", description: "Generic CSV with configurable column mapping" },
    ],
  });
});
