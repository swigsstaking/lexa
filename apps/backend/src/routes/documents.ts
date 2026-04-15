/**
 * Routes documents — upload + OCR pipeline + storage GridFS.
 *
 * POST /documents/upload    → upload multipart, OCR 2-stages, stockage GridFS
 * GET  /documents           → liste docs du tenant (100 derniers)
 * GET  /documents/:id       → métadonnées d'un doc
 * GET  /documents/:id/binary → stream binaire depuis GridFS
 *
 * Session 23 — pipeline OCR initial.
 */

import { Router } from "express";
import multer from "multer";
import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";
import { getBucket, getDb } from "../db/mongo.js";
import { eventStore } from "../events/EventStore.js";
import { extractDocument } from "../services/OcrExtractor.js";

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
 */
documentsRouter.get("/", async (req, res) => {
  try {
    const db = getDb();
    const docs = await db
      .collection("documents_meta")
      .find({ tenantId: req.tenantId })
      .sort({ uploadedAt: -1 })
      .limit(100)
      .project({ _id: 0, gridfsId: 0 })
      .toArray();
    return res.json({ documents: docs });
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
