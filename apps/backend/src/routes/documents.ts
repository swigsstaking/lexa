/**
 * Routes documents — upload + OCR pipeline + storage GridFS.
 *
 * POST /documents/upload           → upload multipart, OCR 2-stages, stockage GridFS
 * GET  /documents                  → liste docs du tenant (100 derniers)
 * GET  /documents/:id              → métadonnées d'un doc
 * GET  /documents/:id/binary       → stream binaire depuis GridFS
 * POST /documents/:id/apply-to-draft → applique les champs OCR sur le draft wizard
 * POST /documents/:id/create-entry   → crée écriture comptable depuis champs OCR
 *
 * Session 23 — pipeline OCR initial.
 * Session 24 — auto-fill wizard depuis documents OCR.
 * Session Lane M — create-entry depuis document OCR.
 */

import { Router } from "express";
import multer from "multer";
import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";
import { getBucket, getDb } from "../db/mongo.js";
import { eventStore } from "../events/EventStore.js";
import { extractDocument } from "../services/OcrExtractor.js";
import { mapDocumentToFields } from "../services/DocumentMapper.js";
import { query, queryAsTenant } from "../db/postgres.js";
import type { ClassificationResult } from "../agents/classifier/ClassifierAgent.js";
import { enqueueLlmCall } from "../services/LlmQueue.js";
import { scheduleLedgerRefresh } from "../services/LedgerRefresh.js";
import { config } from "../config/index.js";

export const documentsRouter = Router();

const ACCEPTED_MIMETYPES = ["application/pdf", "image/jpeg", "image/png"];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const ok = ACCEPTED_MIMETYPES.includes(file.mimetype);
    if (!ok) {
      cb(new Error(`Unsupported file type: ${file.mimetype}. Accepted: PDF, JPEG, PNG`));
    } else {
      cb(null, true);
    }
  },
});

/**
 * POST /documents/upload — upload multipart + pipeline OCR complet
 */
documentsRouter.post("/upload", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "missing file — field name must be 'file'" });

  const tenantId = req.tenantId!;
  const documentId = randomUUID();
  const { buffer, mimetype, originalname, size } = req.file;

  try {
    // 1. Stocker le binaire dans GridFS
    const bucket = getBucket();
    const uploadStream = bucket.openUploadStream(originalname, {
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

    // 2. Pipeline OCR (synchrone — V1, 1 doc à la fois OK)
    const ocrResult = await extractDocument(buffer, mimetype);

    // 3. Persister les métadonnées
    const db = getDb();
    await db.collection("documents_meta").insertOne({
      documentId,
      tenantId,
      gridfsId,
      filename: originalname,
      mimetype,
      size,
      uploadedAt: new Date(),
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
          filename: originalname,
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
      },
    });

    return res.status(201).json({ documentId, filename: originalname, ocrResult });
  } catch (err) {
    console.error("[documents.upload]", err);
    return res.status(500).json({ error: "upload failed", message: (err as Error).message });
  }
});

/**
 * GET /documents — liste les documents du tenant connecté (100 derniers)
 * Enrichit chaque doc avec hasLinkedEntry (cross-check events metadata).
 */
documentsRouter.get("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const db = getDb();
    const docs = await db
      .collection("documents_meta")
      .find({ tenantId })
      .sort({ uploadedAt: -1 })
      .limit(100)
      .project({ _id: 0, gridfsId: 0 })
      .toArray();

    // Cross-check events: quels documentIds ont une TransactionIngested liée ?
    let linkedDocIds = new Set<string>();
    try {
      const eventsResult = await queryAsTenant<{ metadata: Record<string, unknown> }>(
        tenantId,
        `SELECT metadata FROM events
         WHERE tenant_id=$1 AND payload->>'type'='TransactionIngested'
           AND metadata->>'documentId' IS NOT NULL`,
        [tenantId],
      );
      for (const row of eventsResult.rows) {
        const docId = row.metadata?.documentId as string | undefined;
        if (docId) linkedDocIds.add(docId);
      }
    } catch (evtErr) {
      // Ne pas planter si la query échoue (feature gracefully dégradée)
      console.warn("[documents.list] hasLinkedEntry check failed:", (evtErr as Error).message);
    }

    const enriched = docs.map((doc) => ({
      ...doc,
      hasLinkedEntry: linkedDocIds.has(doc.documentId as string),
    }));

    return res.json({ documents: enriched });
  } catch (err) {
    console.error("[documents.list]", err);
    return res.status(500).json({ error: "list failed", message: (err as Error).message });
  }
});

/**
 * GET /documents/:id — métadonnées d'un document
 */
documentsRouter.get("/:id", async (req, res) => {
  // Éviter de matcher /documents/:id/binary sur cette route
  if (req.params.id === "binary") {
    return res.status(400).json({ error: "invalid document id" });
  }
  try {
    const db = getDb();
    const doc = await db.collection("documents_meta").findOne(
      { documentId: req.params.id, tenantId: req.tenantId },
      { projection: { _id: 0, gridfsId: 0 } },
    );
    if (!doc) return res.status(404).json({ error: "not found" });
    return res.json(doc);
  } catch (err) {
    console.error("[documents.get]", err);
    return res.status(500).json({ error: "get failed", message: (err as Error).message });
  }
});

/**
 * GET /documents/:id/binary — stream du fichier original depuis GridFS
 */
documentsRouter.get("/:id/binary", async (req, res) => {
  try {
    const db = getDb();
    const doc = await db.collection("documents_meta").findOne({
      documentId: req.params.id,
      tenantId: req.tenantId,
    });
    if (!doc) return res.status(404).json({ error: "not found" });

    const bucket = getBucket();
    res.setHeader("Content-Type", doc.mimetype as string);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${doc.filename as string}"`,
    );

    const downloadStream = bucket.openDownloadStream(
      new ObjectId(doc.gridfsId as string),
    );
    downloadStream.on("error", (err) => {
      console.error("[documents.binary] stream error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "stream failed" });
      }
    });
    downloadStream.pipe(res);
    return;
  } catch (err) {
    console.error("[documents.binary]", err);
    return res.status(500).json({ error: "binary failed", message: (err as Error).message });
  }
});

/**
 * POST /documents/:id/apply-to-draft — session 24
 *
 * Applique les champs OCR extraits du document sur le brouillon de déclaration
 * wizard du tenant courant pour l'année fiscale demandée.
 *
 * Body : { year: number }   (ex: { year: 2026 })
 * Réponse : { ok: boolean, fieldsApplied: string[], message: string }
 */
documentsRouter.post("/:id/apply-to-draft", async (req, res) => {
  const tenantId = req.tenantId!;
  const documentId = req.params.id;
  const { year } = req.body as { year?: unknown };

  if (!year || !Number.isInteger(year) || (year as number) < 2020 || (year as number) > 2100) {
    return res.status(400).json({ error: "year is required and must be an integer (2020–2100)" });
  }
  const fiscalYear = year as number;

  try {
    // 1. Récupérer le document (isolation tenant stricte)
    const db = getDb();
    const doc = await db.collection("documents_meta").findOne({ documentId, tenantId });
    if (!doc) return res.status(404).json({ error: "document not found" });

    const ocrResult = doc.ocrResult as { type: string; extractedFields: Record<string, unknown> } | null;
    if (!ocrResult?.type) {
      return res.status(422).json({ error: "document has no OCR result" });
    }

    // 2. Récupérer le draft existant (on ne crée pas — le wizard doit exister)
    const draftRes = await queryAsTenant<{ id: string; state: Record<string, unknown> }>(
      tenantId,
      `SELECT id, state FROM taxpayer_drafts WHERE tenant_id=$1 AND fiscal_year=$2 LIMIT 1`,
      [tenantId, fiscalYear],
    );
    if (draftRes.rows.length === 0) {
      return res.status(404).json({
        error: `no draft for year ${fiscalYear}`,
        hint: "create a wizard declaration first",
      });
    }
    const draft = draftRes.rows[0];

    // 3. Mapper les champs
    const mappings = mapDocumentToFields({
      type: ocrResult.type as Parameters<typeof mapDocumentToFields>[0]["type"],
      extractedFields: ocrResult.extractedFields,
    });

    if (mappings.length === 0) {
      return res.json({
        ok: false,
        fieldsApplied: [],
        message: `Aucun champ mappable pour le type "${ocrResult.type}"`,
      });
    }

    // 4. Mettre à jour l'état du draft (deep set sans mutation partielle)
    const newState = structuredClone(draft.state ?? {});
    for (const { fieldPath, value } of mappings) {
      setDeep(newState, fieldPath, value);
    }

    // 5. Persister le draft mis à jour (Postgres)
    await queryAsTenant(
      tenantId,
      `UPDATE taxpayer_drafts SET state=$1::jsonb, updated_at=now() WHERE id=$2`,
      [JSON.stringify(newState), draft.id],
    );

    // 6. Provenance : ajouter une entrée dans documents_meta.appliedToDrafts
    await db.collection("documents_meta").updateOne(
      { documentId },
      {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        $push: { appliedToDrafts: { draftId: draft.id, fiscalYear, fieldsApplied: mappings.map((m) => m.fieldPath), appliedAt: new Date() } as any },
        $set: { updatedAt: new Date() },
      },
    );

    // 7. Event store — streamId doit être un UUID valide (contrainte Postgres)
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const streamId = UUID_REGEX.test(documentId) ? documentId : randomUUID();
    await eventStore.append({
      tenantId,
      streamId,
      event: {
        type: "DocumentAppliedToDraft",
        payload: {
          documentId,
          draftId: draft.id,
          fiscalYear,
          fieldsApplied: mappings.map((m) => m.fieldPath),
        },
      },
    });

    return res.json({
      ok: true,
      fieldsApplied: mappings.map((m) => m.fieldPath),
      message: `${mappings.length} champ(s) pré-rempli(s) dans votre déclaration ${fiscalYear}`,
    });
  } catch (err) {
    console.error("[documents.apply-to-draft]", err);
    return res.status(500).json({ error: "apply failed", message: (err as Error).message });
  }
});

/**
 * POST /documents/:id/create-entry — Lane M
 *
 * Crée une écriture comptable (TransactionIngested + TransactionClassified)
 * depuis les champs OCR d'un document. Lie le documentId dans les metadata.
 *
 * Body: { account?: string }  // optionnel — forcer un compte
 * Response: { streamId, classification?, message }
 */
documentsRouter.post("/:id/create-entry", async (req, res) => {
  const tenantId = req.tenantId!;
  const documentId = req.params.id;

  try {
    const db = getDb();
    const doc = await db.collection("documents_meta").findOne({ documentId, tenantId });
    if (!doc) return res.status(404).json({ error: "document not found" });

    const ocrResult = doc.ocrResult as { extractedFields?: Record<string, unknown> } | null;
    if (!ocrResult?.extractedFields || Object.keys(ocrResult.extractedFields).length === 0) {
      return res.status(400).json({ error: "no OCR data — extractedFields is empty" });
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
    const amount = -Math.abs(rawAmount); // paiement sortant (négatif)
    const date =
      (fields.date as string | undefined) ??
      new Date().toISOString().slice(0, 10);
    const counterpartyName =
      (fields.fournisseur as string | undefined) ??
      (fields.counterparty as string | undefined) ??
      "";

    // 1. Persister TransactionIngested avec documentId dans metadata
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
      // counterpartyName et documentId dans metadata (pas dans le payload typé)
      metadata: { documentId, counterpartyName },
    });

    // 2. Classify via LLM (fire-and-forget pattern de connectors.ts)
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
        console.warn(`[documents/create-entry] classify save failed for ${streamId}:`, (classErr as Error).message);
      }
    }).catch((err) => {
      console.warn(`[documents/create-entry] enqueue classifier failed:`, (err as Error).message);
    });

    scheduleLedgerRefresh(tenantId);

    return res.status(202).json({ streamId, message: "Écriture créée — classification en cours" });
  } catch (err) {
    console.error("[documents.create-entry]", err);
    return res.status(500).json({ error: "create-entry failed", message: (err as Error).message });
  }
});

/**
 * Écrit une valeur en profondeur dans un objet selon un dot-path.
 * Ex: setDeep({}, "step2.salaireBrut", 85000) → { step2: { salaireBrut: 85000 } }
 */
function setDeep(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (typeof cur[key] !== "object" || cur[key] === null) {
      cur[key] = {};
    }
    cur = cur[key] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}
