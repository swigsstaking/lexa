import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import multer from "multer";
import { eventStore } from "../events/EventStore.js";
import type { ClassificationResult } from "../agents/classifier/ClassifierAgent.js";
import { enqueueLlmCall } from "../services/LlmQueue.js";
import { query, queryAsTenant } from "../db/postgres.js";
import { requireHmac } from "../middleware/requireHmac.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { config } from "../config/index.js";
import { proWebhookClient } from "../services/ProWebhookClient.js";
import { parseCamt053 } from "../services/Camt053Parser.js";
import { scheduleLedgerRefresh, flushLedgerRefresh } from "../services/LedgerRefresh.js";
import { computeFingerprint, lookupByFingerprint } from "../services/TransactionFingerprint.js";

export const connectorsRouter = Router();

// ── Multer pour upload CAMT.053 XML ───────────────────────────────────────────
// Limite 10 MB (les CAMT réels font 50 KB–500 KB en général)
const xmlUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const isXml =
      file.mimetype === "application/xml" ||
      file.mimetype === "text/xml" ||
      file.originalname.toLowerCase().endsWith(".xml");
    if (!isXml) {
      cb(new Error(`Expected XML file, got: ${file.mimetype} (${file.originalname})`));
    } else {
      cb(null, true);
    }
  },
});

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

      const classification = (await enqueueLlmCall(tenantId, "classifier", {
        date: tx.bookingDate,
        description,
        amount: signedAmount,
        currency: tx.currency,
        counterpartyIban: tx.counterpartyIban,
      })) as ClassificationResult;

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

      // Trigger debounced ledger refresh (non-blocking, ~2.5s after last classified tx)
      scheduleLedgerRefresh(tenantId);

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
      {
        id: "camt053",
        description: "ISO 20022 CAMT.053 XML (relevé bancaire standard suisse)",
        schema: "multipart/form-data, field 'file' = fichier XML CAMT.053",
        endpoint: "POST /connectors/camt053/upload",
        auth: "JWT Bearer",
      },
    ],
    planned: [
      { id: "csv", description: "Generic CSV with configurable column mapping" },
    ],
  });
});

// ── CAMT.053 upload — ingestion bancaire standard suisse ISO 20022 ────────────

/**
 * Ingère une liste de ParsedTransaction dans l'event store avec déduplication.
 *
 * Stratégie :
 *  - Check dedup via `messageId + txId` dans la table events
 *  - Append TransactionIngested (fire) puis enqueue classifier (forget)
 *  - Retourne stats : ingested / skipped (dedup) / failed
 */
async function ingestCamt053Transactions(
  tenantId: string,
  transactions: import("../services/Camt053Parser.js").ParsedTransaction[],
): Promise<{ ingested: number; skipped: number; failed: number; streamIds: string[] }> {
  let ingested = 0;
  let skipped = 0;
  let failed = 0;
  const streamIds: string[] = [];

  let dedupFingerprintCount = 0;

  for (const tx of transactions) {
    try {
      // CRDT = entrée banque (amount positif), DBIT = sortie (amount négatif)
      const signedAmount = tx.creditDebit === "DBIT" ? -tx.amount : tx.amount;

      // Description enrichie pour le classifier (RAG match optimal)
      const descParts = [
        tx.counterpartyName,
        tx.reference,
        tx.structuredRef,
      ].filter(Boolean);
      const description = descParts.join(" | ") || `${tx.creditDebit} ${tx.currency} ${tx.amount}`;

      // ── Fingerprint cross-source ───────────────────────────────────────────
      const fingerprint = computeFingerprint({
        amount: Math.abs(signedAmount),
        date: tx.bookingDate,
        description,
        iban: tx.accountIban,
        bankRef: tx.structuredRef,
      });

      // ── Déduplication 1 : fingerprint cross-source (CAMT + Pro) ──────────
      const fingerprintMatch = await lookupByFingerprint(tenantId, fingerprint);
      if (fingerprintMatch) {
        dedupFingerprintCount++;
        console.info(
          "[camt053] dedup fingerprint match, skip txId=%s streamId=%s",
          tx.txId,
          fingerprintMatch.streamId,
        );
        skipped++;
        continue;
      }

      // ── Déduplication 2 : même txId CAMT déjà ingéré ────────────────────
      const dupCheck = await queryAsTenant<{ id: string }>(
        tenantId,
        `SELECT id FROM events
         WHERE tenant_id = $1
           AND type = 'TransactionIngested'
           AND metadata->>'source' = 'camt053'
           AND metadata->>'txId' = $2
         LIMIT 1`,
        [tenantId, tx.txId],
      );
      if (dupCheck.rows.length > 0) {
        skipped++;
        continue;
      }

      const streamId = randomUUID();

      // ── Append event TransactionIngested ──────────────────────────────────
      await eventStore.append({
        tenantId,
        streamId,
        event: {
          type: "TransactionIngested",
          payload: {
            source: "camt053",
            date: tx.bookingDate,
            description,
            amount: signedAmount,
            currency: tx.currency,
            counterpartyIban: tx.counterpartyIban,
          },
        },
        metadata: {
          source: "camt053",
          txId: tx.txId,
          messageId: tx.messageId,
          statementId: tx.statementId,
          accountIban: tx.accountIban,
          accountName: tx.accountName,
          counterpartyName: tx.counterpartyName,
          valueDate: tx.valueDate,
          structuredRef: tx.structuredRef,
          fingerprint, // dedup cross-source
        },
      });

      streamIds.push(streamId);

      // ── Enqueue classifier (fire-and-forget) ──────────────────────────────
      // Ne pas await : la classification tourne en background via LlmQueue
      enqueueLlmCall(tenantId, "classifier", {
        date: tx.bookingDate,
        description,
        amount: signedAmount,
        currency: tx.currency,
        counterpartyIban: tx.counterpartyIban,
      }).then(async (classification) => {
        const cl = classification as import("../agents/classifier/ClassifierAgent.js").ClassificationResult;
        try {
          const classifiedEvent = await eventStore.append({
            tenantId,
            streamId,
            event: {
              type: "TransactionClassified",
              payload: {
                transactionStreamId: streamId,
                agent: "classifier",
                model: "lexa-classifier",
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
            metadata: { durationMs: cl.durationMs },
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
              cl.confidence,
              cl.reasoning,
              JSON.stringify(cl.citations),
              JSON.stringify(cl.alternatives),
              cl.durationMs,
            ],
          );

          // Trigger debounced ledger refresh after each classification
          scheduleLedgerRefresh(tenantId);
        } catch (classErr) {
          console.warn(
            `[camt053] classifier bg failed for ${streamId}:`,
            (classErr as Error).message,
          );
        }
      }).catch((err) => {
        console.warn(
          `[camt053] enqueue classifier failed for ${tx.txId}:`,
          (err as Error).message,
        );
      });

      ingested++;
    } catch (err) {
      console.error(`[camt053] ingest failed for ${tx.txId}:`, (err as Error).message);
      failed++;
    }
  }

  if (dedupFingerprintCount > 0) {
    console.info(`[camt053] dedup: ${dedupFingerprintCount} transaction(s) skipped via fingerprint (cross-source match)`);
  }

  return { ingested, skipped, failed, streamIds };
}

/**
 * POST /connectors/camt053/upload
 *
 * Upload d'un fichier XML CAMT.053 (ISO 20022) — relevé bancaire standard suisse.
 * Authentification JWT Bearer (requireAuth).
 *
 * Body : multipart/form-data, champ "file" = fichier XML
 *
 * Response 201 :
 *   { messageId, accountIban, accountName, currency,
 *     transactionsCount, ingested, skipped, failed, streamIds, warnings }
 *
 * Erreurs :
 *   400 — fichier manquant ou type incorrect
 *   422 — XML invalide ou structure CAMT.053 incorrecte
 *   500 — erreur d'ingestion
 *
 * Idempotence : un même upload (messageId+txId) est ignoré silencieusement
 * (skipped++), pas d'erreur.
 */
connectorsRouter.post(
  "/camt053/upload",
  requireAuth,
  xmlUpload.single("file"),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "missing file — field name must be 'file'" });
    }

    // Déjà filtré par multer fileFilter, double-check explicite
    const isXml =
      req.file.mimetype === "application/xml" ||
      req.file.mimetype === "text/xml" ||
      req.file.originalname.toLowerCase().endsWith(".xml");
    if (!isXml) {
      return res.status(400).json({
        error: "expected XML file",
        got: req.file.mimetype,
      });
    }

    const xmlContent = req.file.buffer.toString("utf-8");

    let parseResult: import("../services/Camt053Parser.js").Camt053ParseResult;
    try {
      parseResult = parseCamt053(xmlContent);
    } catch (err) {
      return res.status(422).json({
        error: "CAMT.053 parse failed",
        message: (err as Error).message,
      });
    }

    if (parseResult.warnings.length > 0) {
      console.warn("[camt053] parse warnings:", parseResult.warnings);
    }

    const tenantId = req.tenantId!;
    const { transactions, messageId, accountIban, accountName, currency, warnings } =
      parseResult;

    if (transactions.length === 0) {
      return res.status(422).json({
        error: "no transactions found in CAMT.053",
        messageId,
        warnings,
      });
    }

    const stats = await ingestCamt053Transactions(tenantId, transactions);

    console.info(
      `[camt053] tenant=${tenantId} msgId=${messageId} total=${transactions.length} ingested=${stats.ingested} skipped=${stats.skipped} failed=${stats.failed}`,
    );

    // Flush ledger refresh immediately after ingestion (classifications run in background;
    // each classify also calls scheduleLedgerRefresh, but flushing now ensures the view
    // reflects at least the ingested transactions and any already-classified ones)
    if (stats.ingested > 0) {
      flushLedgerRefresh(tenantId);
    }

    res.status(201).json({
      messageId,
      accountIban,
      accountName,
      currency,
      transactionsCount: transactions.length,
      ingested: stats.ingested,
      skipped: stats.skipped,
      failed: stats.failed,
      streamIds: stats.streamIds,
      warnings,
    });
  },
);
