/**
 * Worker BullMQ — ocr.process
 * Pipeline : upload → classifier vision → parser OCR → update pp_imports
 *
 * P1.B.B1 — backend OCR pipeline modal import PP
 *
 * Perf target : p95 <30s sur document moyen (spec §6.1 critère 3).
 */

import { Queue, Worker, type Job } from "bullmq";
import { readFile } from "node:fs/promises";
import { config } from "../config/index.js";
import { queryAsTenant } from "../db/postgres.js";
import { classifyDocument, extractByCategory } from "../services/ocr/index.js";
import { categoryToWizardStep, type ImportCategory } from "../services/ocr/prompts.js";
import { deleteUploadedFile } from "../services/storage/uploads.js";

const redisConnection = {
  host: config.REDIS_HOST,
  port: config.REDIS_PORT,
  enableOfflineQueue: false,
  lazyConnect: true,
};

// ── Queue export (pour enqueue depuis les routes) ─────────────────────────────

export const ocrQueue = new Queue("ocr.process", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 10_000 },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});

// ── Types job ─────────────────────────────────────────────────────────────────

export interface OcrProcessJobData {
  importId: string;
  tenantId: string;
  filePath: string;
  mimeType: string;
  category: ImportCategory | "auto";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Confidence min pour accepter la classification auto */
const AUTO_CLASSIFY_MIN_CONFIDENCE = 0.7;

// ── Worker ────────────────────────────────────────────────────────────────────

async function processOcrJob(job: Job<OcrProcessJobData>): Promise<void> {
  const { importId, tenantId, filePath, mimeType, category: initialCategory } = job.data;

  // 1. Status → processing
  await queryAsTenant(
    tenantId,
    `UPDATE pp_imports SET status='processing', updated_at=now() WHERE id=$1`,
    [importId],
  );

  let imageBuffer: Buffer;
  try {
    // 2. Lire le fichier depuis le disque
    // Pour les PDF, OcrExtractor existant convertit en PNG — ici on passe directement
    // le buffer à extractByCategory qui utilise @napi-rs/canvas pour le preprocessing.
    imageBuffer = await readFile(filePath);
  } catch (err) {
    const msg = `File not found or unreadable: ${filePath} — ${(err as Error).message}`;
    await markFailed(tenantId, importId, msg);
    throw err;
  }

  // 3. Si category = 'auto' → classifier vision
  let category = initialCategory as ImportCategory;
  if (initialCategory === "auto") {
    // Pour les PDF, on doit convertir en image avant classification
    let classifyBuffer = imageBuffer;
    if (mimeType === "application/pdf") {
      classifyBuffer = await pdfToImageBuffer(imageBuffer);
    }
    const classified = await classifyDocument(classifyBuffer);

    if (classified.confidence >= AUTO_CLASSIFY_MIN_CONFIDENCE) {
      category = classified.category;
    } else {
      // Confiance insuffisante : on met status=extracted avec low confidence
      // et on laisse l'utilisateur choisir manuellement
      await queryAsTenant(
        tenantId,
        `UPDATE pp_imports
         SET status='extracted',
             raw_extraction=$2,
             confidence=$3,
             category='auto',
             wizard_step_target=NULL,
             updated_at=now()
         WHERE id=$1`,
        [
          importId,
          JSON.stringify({ _classifier_confidence: classified.confidence, _needs_manual_category: true }),
          classified.confidence,
        ],
      );
      return;
    }
  }

  // 4. Pour les PDF : conversion en image avant OCR vision
  let ocrBuffer = imageBuffer;
  if (mimeType === "application/pdf") {
    ocrBuffer = await pdfToImageBuffer(imageBuffer);
  }

  // 5. Extraction OCR par catégorie
  const extraction = await extractByCategory(ocrBuffer, category);

  // 6. Update status = 'extracted'
  await queryAsTenant(
    tenantId,
    `UPDATE pp_imports
     SET status='extracted',
         raw_extraction=$2,
         confidence=$3,
         category=$4,
         wizard_step_target=$5,
         updated_at=now()
     WHERE id=$1`,
    [
      importId,
      JSON.stringify(extraction.rawExtraction),
      extraction.confidence,
      category,
      categoryToWizardStep(category),
    ],
  );

  console.info(
    `[ocr.process] import ${importId} extracted — category=${category} confidence=${extraction.confidence} duration=${extraction.durationMs}ms`,
  );
}

/** Convertit un PDF en buffer image PNG via pdfjs-dist + @napi-rs/canvas (réutilise la logique OcrExtractor) */
async function pdfToImageBuffer(pdfBuffer: Buffer): Promise<Buffer> {
  const { getDocument } = await import(
    /* webpackIgnore: true */ "pdfjs-dist/legacy/build/pdf.mjs" as string
  );
  const { createCanvas } = await import("@napi-rs/canvas");

  const pdf = await (getDocument as CallableFunction)({
    data: new Uint8Array(pdfBuffer),
    useWorkerFetch: false,
    isEvalSupported: false,
    disableWorker: true,
  }).promise;

  const page = await (pdf as { getPage: (n: number) => Promise<unknown> }).getPage(1);
  const viewport = (
    page as { getViewport: (opts: { scale: number }) => { width: number; height: number } }
  ).getViewport({ scale: 1.5 }); // scale 1.5 = ~150dpi, suffisant + rapide

  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const context = canvas.getContext("2d");

  await (
    page as {
      render: (opts: { canvasContext: unknown; viewport: unknown }) => { promise: Promise<void> };
    }
  ).render({ canvasContext: context, viewport }).promise;

  return canvas.toBuffer("image/png");
}

/** Marque un import comme failed */
async function markFailed(tenantId: string, importId: string, message: string): Promise<void> {
  try {
    await queryAsTenant(
      tenantId,
      `UPDATE pp_imports SET status='failed', error_message=$2, updated_at=now() WHERE id=$1`,
      [importId, message],
    );
  } catch (err) {
    console.error("[ocr.process] markFailed DB error:", err);
  }
}

// ── Worker instance ───────────────────────────────────────────────────────────

export const ocrWorker = new Worker<OcrProcessJobData>(
  "ocr.process",
  async (job) => {
    try {
      await processOcrJob(job);
    } catch (err) {
      const msg = (err as Error).message;
      // Sur la dernière tentative, marquer comme failed
      if (job.attemptsMade >= (job.opts.attempts ?? 3) - 1) {
        await markFailed(job.data.tenantId, job.data.importId, msg);
        // Nettoyage fichier si 3 tentatives échouées
        await deleteUploadedFile(job.data.filePath);
      }
      throw err;
    }
  },
  {
    connection: redisConnection,
    concurrency: 4, // 4 jobs OCR en parallèle max (GPU partagé avec LlmQueue)
  },
);

ocrWorker.on("error", (err) => {
  console.error("[ocr.process] worker error:", err.message);
});

ocrWorker.on("failed", (job, err) => {
  if (job) {
    console.error(`[ocr.process] job ${job.id} failed (attempt ${job.attemptsMade}):`, err.message);
  }
});

ocrWorker.on("completed", (job) => {
  console.info(`[ocr.process] job ${job.id} completed in ${Date.now() - (job.processedOn ?? Date.now())}ms`);
});

/** Graceful shutdown */
export async function shutdownOcrWorker(): Promise<void> {
  await Promise.allSettled([ocrWorker.close(), ocrQueue.close()]);
}
