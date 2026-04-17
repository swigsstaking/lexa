/**
 * DocumentIngest — Helpers partagés pour uploader un document depuis un Buffer
 * et créer une écriture comptable depuis le résultat OCR.
 *
 * Utilisé par routes/documents.ts (upload multipart) ET EmailRouter (pièces jointes email).
 * Phase 1 V1.2 — email forward IMAP.
 */

import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import { getBucket, getDb } from "../db/mongo.js";
import { eventStore } from "../events/EventStore.js";
import { extractDocument } from "./OcrExtractor.js";
import { queryAsTenant } from "../db/postgres.js";
import { enqueueLlmCall } from "./LlmQueue.js";
import { scheduleLedgerRefresh } from "./LedgerRefresh.js";
import { config } from "../config/index.js";
import type { ClassificationResult } from "../agents/classifier/ClassifierAgent.js";

/**
 * Uploade un buffer en tant que document Lexa (GridFS + OCR + events).
 * Retourne le documentId créé.
 */
export async function uploadDocumentFromBuffer(
  tenantId: string,
  filename: string,
  buffer: Buffer,
  mimetype: string,
): Promise<string> {
  const documentId = randomUUID();
  const size = buffer.length;

  // 1. Stockage GridFS
  const bucket = getBucket();
  const uploadStream = bucket.openUploadStream(filename, {
    metadata: {
      tenantId,
      documentId,
      mimetype,
      size,
      uploadedAt: new Date(),
    },
  });

  await new Promise<void>((resolve, reject) => {
    Readable.from(buffer)
      .pipe(uploadStream)
      .on("finish", () => resolve())
      .on("error", (err) => reject(err));
  });

  const gridfsId = uploadStream.id.toString();

  // 2. Pipeline OCR
  const ocrResult = await extractDocument(buffer, mimetype);

  // 3. Métadonnées Mongo
  const db = getDb();
  await db.collection("documents_meta").insertOne({
    documentId,
    tenantId,
    gridfsId,
    filename,
    mimetype,
    size,
    uploadedAt: new Date(),
    source: "email",
    ocrResult,
  });

  // 4. Event store Postgres
  await eventStore.append({
    tenantId,
    streamId: documentId,
    event: {
      type: "DocumentUploaded",
      payload: {
        documentId,
        filename,
        mimetype,
        size,
        ocrType: ocrResult.type,
        ocrConfidence: ocrResult.ocrConfidence,
        extractedFields: ocrResult.extractedFields,
      },
    },
    metadata: {
      gridfsId,
      extractionMethod: ocrResult.extractionMethod,
      ocrDurationMs: ocrResult.durationMs,
      source: "email",
    },
  });

  return documentId;
}

/**
 * Crée une écriture comptable depuis les champs OCR d'un document existant.
 * Fire-and-forget friendly — loggue les erreurs sans throw.
 */
export async function createEntryFromDocument(
  tenantId: string,
  documentId: string,
): Promise<void> {
  const db = getDb();
  const doc = await db.collection("documents_meta").findOne({ documentId, tenantId });
  if (!doc) {
    console.warn(`[DocumentIngest] createEntry: document ${documentId} not found`);
    return;
  }

  const ocrResult = doc.ocrResult as { extractedFields?: Record<string, unknown> } | null;
  if (!ocrResult?.extractedFields || Object.keys(ocrResult.extractedFields).length === 0) {
    console.info(`[DocumentIngest] createEntry: no OCR fields for ${documentId}, skipping entry creation`);
    return;
  }

  const fields = ocrResult.extractedFields as Record<string, unknown>;
  const description =
    (fields.description as string | undefined) ??
    (fields.fournisseur as string | undefined) ??
    (doc.filename as string);
  const rawAmount =
    (fields.amountTtc as number | undefined) ??
    (fields.amount as number | undefined) ??
    0;
  const amount = -Math.abs(rawAmount);
  const date =
    (fields.date as string | undefined) ??
    new Date().toISOString().slice(0, 10);
  const counterpartyName =
    (fields.fournisseur as string | undefined) ??
    (fields.counterparty as string | undefined) ??
    "";

  const streamId = randomUUID();
  await eventStore.append({
    tenantId,
    streamId,
    event: {
      type: "TransactionIngested",
      payload: {
        description,
        amount,
        currency: "CHF",
        date,
        source: "ocr",
      },
    },
    metadata: { documentId, counterpartyName, source: "email" },
  });

  // Classification LLM asynchrone
  enqueueLlmCall(tenantId, "classifier", {
    date,
    description,
    amount,
    currency: "CHF",
    counterpartyIban: undefined,
  }).then(async (classification) => {
    const cl = classification as ClassificationResult;
    try {
      const classifiedEvent = await eventStore.append({
        tenantId,
        streamId,
        event: {
          type: "TransactionClassified",
          payload: {
            transactionStreamId: streamId,
            agent: "classifier",
            model: config.MODEL_CLASSIFIER ?? "lexa-classifier",
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
          config.MODEL_CLASSIFIER ?? "lexa-classifier",
          cl.confidence,
          cl.reasoning,
          JSON.stringify(cl.citations),
          JSON.stringify(cl.alternatives),
          cl.durationMs,
        ],
      );
      scheduleLedgerRefresh(tenantId);
    } catch (classErr) {
      console.warn(`[DocumentIngest] classify save failed for ${streamId}:`, (classErr as Error).message);
    }
  }).catch((err: Error) => {
    console.warn(`[DocumentIngest] enqueue classifier failed:`, err.message);
  });

  scheduleLedgerRefresh(tenantId);
}
