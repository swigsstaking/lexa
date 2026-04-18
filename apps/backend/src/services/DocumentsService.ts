/**
 * DocumentsService — Service de gestion des documents Lexa.
 *
 * Phase 3 V1.1 — tag "Swigs Pro" dans /documents.
 * Les events Pro (invoice.created, invoice.paid, expense.submitted, etc.)
 * créent désormais un document MongoDB virtuel (sans binaire GridFS) visible
 * dans la page /documents avec le badge "Pro".
 */

import { getDb } from "../db/mongo.js";

export interface CreateProDocumentParams {
  tenantId: string;
  proInvoiceId?: string;
  proExpenseId?: string;
  proEvent: string; // "invoice.created", "invoice.sent", "invoice.paid", "expense.submitted"
  proInvoiceNumber?: string;
  fileName: string; // computed from event data
  description: string;
  amount: number;
  date: string; // ISO date YYYY-MM-DD
  streamId: string; // lien vers TransactionIngested
}

/**
 * Crée un document virtuel Swigs Pro dans MongoDB (pas de binaire GridFS).
 * Retourne l'ObjectId du document créé.
 *
 * Ne doit pas bloquer le caller en cas d'erreur — le caller doit wrapper en try/catch.
 */
export async function createProDocument(params: CreateProDocumentParams): Promise<string> {
  const db = getDb();
  const now = new Date();

  const doc = {
    // Identifiants
    documentId: params.streamId, // réutilise le streamId comme documentId pour le lien
    tenantId: params.tenantId,
    // Source Pro — pas de binaire (virtual document)
    source: "swigs-pro" as const,
    sourceEvent: params.proEvent,
    contentType: "application/x-pro-event",
    // Pas de gridfsId, pas de fileBuffer — virtual
    filename: params.fileName,
    description: params.description,
    amount: params.amount,
    date: params.date,
    // Références Pro
    proInvoiceId: params.proInvoiceId ?? null,
    proExpenseId: params.proExpenseId ?? null,
    proInvoiceNumber: params.proInvoiceNumber ?? null,
    // Lien vers l'event store
    linkedStreamId: params.streamId,
    // Métadonnées
    mimetype: "application/x-pro-event",
    size: 0,
    uploadedAt: now,
    createdAt: now,
    // OCR virtuel minimal (pour compatibilité avec le type DocumentMeta frontend)
    ocrResult: {
      rawText: params.description,
      extractionMethod: "pro-bridge" as "pdf-parse",
      ocrConfidence: 1.0,
      type: "facture" as const,
      extractedFields: {
        description: params.description,
        amount: Math.abs(params.amount),
        date: params.date,
        ...(params.proInvoiceNumber ? { invoiceNumber: params.proInvoiceNumber } : {}),
        ...(params.proInvoiceId ? { proInvoiceId: params.proInvoiceId } : {}),
        ...(params.proExpenseId ? { proExpenseId: params.proExpenseId } : {}),
      },
      durationMs: 0,
    },
  };

  const result = await db.collection("documents_meta").insertOne(doc);
  return result.insertedId.toString();
}
