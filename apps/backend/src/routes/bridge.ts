/**
 * bridge.ts — Route POST /bridge/pro-events
 *
 * Intégration bidirectionnelle Swigs Pro → Lexa (Phase 3 V1.3).
 * Reçoit les events du Hub EventBus publiés par Swigs Pro
 * et les ingère dans le store Lexa.
 *
 * Auth : HMAC-SHA256 sur rawBody via middleware requireHmac existant
 *   Header : X-Lexa-Signature: sha256=<hex>
 *   Secret : LEXA_WEBHOOK_SECRET (partagé avec Swigs Pro)
 *
 * Events supportés :
 *   invoice.created  → TransactionIngested source=swigs-pro-invoice
 *                      + TransactionClassified auto (1100 / 3200)
 *   invoice.sent     → Idempotent : update statut si invoice.created déjà vu,
 *                      sinon crée TransactionIngested source=swigs-pro-invoice-sent
 *   invoice.paid     → TransactionIngested source=swigs-pro-payment
 *                      + metadata.reconciles = stream_id de invoice.created
 *                      + TransactionClassified auto (1020 / 1100)
 *   expense.submitted → TransactionIngested source=swigs-pro-expense
 *                       + TransactionClassified auto (6500 / 1020)
 *
 * Tenant mapping (V1.3) :
 *   Fallback chain via resolveTenantId() :
 *   1. UUID direct (comportement V1)
 *   2. Table pro_lexa_tenant_map (mapping manuel ou auto)
 *   3. users.external_sso_id ou email match → auto-populate mapping
 *   4. DEFAULT_TENANT_ID (demo)
 */

import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { eventStore } from "../events/EventStore.js";
import { enqueueLlmCall } from "../services/LlmQueue.js";
import { scheduleLedgerRefresh, flushLedgerRefresh } from "../services/LedgerRefresh.js";
import { requireHmac } from "../middleware/requireHmac.js";
import { query, queryAsTenant } from "../db/postgres.js";
import type { ClassificationResult } from "../agents/classifier/ClassifierAgent.js";
import { computeFingerprint, lookupByFingerprint, enrichEventMetadata } from "../services/TransactionFingerprint.js";
import { isProSyncEnabled } from "../services/TenantSettings.js";
import { createProDocument } from "../services/DocumentsService.js";

export const bridgeRouter = Router();

const DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001";

// ── Bloc C — Mapping tenant Pro ↔ Lexa robuste ───────────────────────────────

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(s: string): boolean {
  return UUID_REGEX.test(s);
}

/**
 * Résoudre le tenantId Lexa depuis un identifiant Pro (UUID ou hubUserId string).
 *
 * Fallback chain :
 *   1. UUID direct → utiliser tel quel (comportement V1)
 *   2. Table pro_lexa_tenant_map → mapping explicite
 *   3. users.external_sso_id ou email → auto-populate mapping
 *   4. DEFAULT_TENANT_ID (demo)
 */
async function resolveTenantId(proPayloadTenantId: string): Promise<string> {
  // 1. UUID direct
  if (isValidUUID(proPayloadTenantId)) {
    return proPayloadTenantId;
  }

  // 2. Chercher dans le mapping
  const mapResult = await query<{ lexa_tenant_id: string }>(
    `SELECT lexa_tenant_id FROM pro_lexa_tenant_map WHERE pro_hub_user_id = $1 LIMIT 1`,
    [proPayloadTenantId],
  );
  if (mapResult.rows.length > 0) {
    // Update last_seen_at async (fire-and-forget)
    query(
      `UPDATE pro_lexa_tenant_map SET last_seen_at = now() WHERE pro_hub_user_id = $1`,
      [proPayloadTenantId],
    ).catch(() => {});
    return mapResult.rows[0].lexa_tenant_id;
  }

  // 3. Fallback via users.external_sso_id ou email
  const userResult = await query<{ tenant_id: string }>(
    `SELECT tenant_id FROM users WHERE external_sso_id = $1 OR email = $1 LIMIT 1`,
    [proPayloadTenantId],
  );
  if (userResult.rows.length > 0) {
    const lexaTenantId = userResult.rows[0].tenant_id;
    // Auto-populate le mapping pour les prochains events
    query(
      `INSERT INTO pro_lexa_tenant_map (pro_hub_user_id, lexa_tenant_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [proPayloadTenantId, lexaTenantId],
    ).catch(() => {});
    console.info("[bridge] resolveTenantId: auto-mapped %s → %s", proPayloadTenantId, lexaTenantId);
    return lexaTenantId;
  }

  // 4. Dernier fallback : demo
  console.warn(
    "[bridge] resolveTenantId: no mapping found for '%s', using DEFAULT_TENANT_ID",
    proPayloadTenantId,
  );
  return DEFAULT_TENANT_ID;
}

// ── Schemas zod pour chaque type d'event ─────────────────────────────────────

const InvoiceCreatedDataSchema = z.object({
  invoiceId: z.string(),
  invoiceNumber: z.string(),
  projectId: z.string().optional(),
  projectName: z.string().optional(),
  clientName: z.string().optional(),
  // Swigs Pro publie `total` (TTC), amountHt/amountTtc sont calculés ici
  total: z.number().nonnegative().optional(),
  amountHt: z.number().nonnegative().optional(),
  amountTva: z.number().nonnegative().optional(),
  amountTtc: z.number().nonnegative().optional(),
  tvaRate: z.number().nonnegative().default(8.1),
  dueDate: z.string().optional(),
  description: z.string().optional(),
  // champ client Swigs Pro (objet ou string)
  client: z.union([z.string(), z.record(z.unknown())]).optional(),
});

const InvoicePaidDataSchema = z.object({
  invoiceId: z.string(),
  invoiceNumber: z.string(),
  projectId: z.string().optional(),
  projectName: z.string().optional(),
  total: z.number().nonnegative().optional(),
  amountTtc: z.number().nonnegative().optional(),
  paidAt: z.string().optional(),
  client: z.union([z.string(), z.record(z.unknown())]).optional(),
  clientName: z.string().optional(),
});

const ExpenseSubmittedDataSchema = z.object({
  expenseId: z.string(),
  description: z.string(),
  amount: z.number().nonnegative(),
  currency: z.string().length(3).default("CHF"),
  date: z.string().optional(),
  category: z.string().optional(),
  supplierName: z.string().optional(),
});

const InvoiceSentDataSchema = z.object({
  invoiceId: z.string(),
  invoiceNumber: z.string(),
  projectId: z.string().optional(),
  projectName: z.string().optional(),
  clientName: z.string().optional(),
  total: z.number().nonnegative().optional(),
  amountHt: z.number().nonnegative().optional(),
  amountTva: z.number().nonnegative().optional(),
  amountTtc: z.number().nonnegative().optional(),
  tvaRate: z.number().nonnegative().default(8.1),
  dueDate: z.string().optional(),
  sentAt: z.string().optional(),
  client: z.union([z.string(), z.record(z.unknown())]).optional(),
});

const BankTransactionDataSchema = z.object({
  bankTxId: z.string().optional(), // ID Mongo Pro unique (ex: tx._id.toString())
  bankRef: z.string().optional(), // référence SCOR ou IBAN
  iban: z.string().optional(),
  date: z.string(), // ISO date
  amount: z.number(),
  currency: z.string().default("CHF"),
  description: z.string(),
  counterpartyName: z.string().optional(),
});

const BridgeEventSchema = z.object({
  event: z.string(),
  timestamp: z.string().optional(),
  tenantId: z.string().optional(), // Peut être UUID ou hubUserId — résolu via resolveTenantId()
  hubUserId: z.string().optional(),
  data: z.record(z.unknown()).optional(),
  payload: z.record(z.unknown()).optional(), // alias alternatif
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Classification déterministe pour les events Swigs Pro.
 * Bypasse le LLM — les comptes sont fixes selon le type d'event.
 */
type ProClassificationHint = {
  debitAccount: string;
  creditAccount: string;
  reasoning: string;
};

function deterministicProClassification(
  proEvent: string,
  amount: number,
): ProClassificationHint | null {
  switch (proEvent) {
    case "invoice.created":
    case "invoice.sent":
      return {
        debitAccount: "1100", // Créances clients / Débiteurs
        creditAccount: "3200", // Prestations de services
        reasoning: "Facture client émise (Pro event déterministe)",
      };
    case "invoice.paid":
      return {
        debitAccount: "1020", // Banque
        creditAccount: "1100", // Débiteurs (encaissement)
        reasoning: "Paiement facture client (Pro event déterministe)",
      };
    case "expense.submitted":
      return {
        debitAccount: "6500", // Frais administratifs
        creditAccount: "1020", // Banque
        reasoning: "Note de frais employé (Pro event déterministe)",
      };
    case "bank.transaction":
      return null; // laisser le classifier IA décider (loyer/salaires/achats/etc.)
    default:
      return {
        debitAccount: "UNKNOWN",
        creditAccount: "UNKNOWN",
        reasoning: `Unknown Pro event: ${proEvent}`,
      };
  }
}

/**
 * Extraire le nom du client depuis le champ polymorphe `client` de Swigs Pro.
 * client peut être une string ou un objet { name, email, ... }
 */
function extractClientName(data: {
  clientName?: string;
  client?: string | Record<string, unknown>;
  projectName?: string;
}): string {
  if (data.clientName) return data.clientName;
  if (typeof data.client === "string") return data.client;
  if (data.client && typeof data.client === "object") {
    const c = data.client as Record<string, unknown>;
    if (typeof c.name === "string") return c.name;
    if (typeof c.company === "string") return c.company;
    if (typeof c.email === "string") return c.email;
  }
  return data.projectName ?? "Client inconnu";
}

/**
 * Enqueue classification et persiste TransactionClassified + ai_decisions.
 * Fire-and-forget — ne bloque pas la réponse HTTP.
 *
 * Si `deterministicHint` est fourni, bypasse le LLM et persiste directement
 * la classification déterministe (confidence=1.0, agent=pro-bridge-deterministic).
 * Utilisé pour tous les events Swigs Pro dont les comptes sont connus d'avance.
 */
function classifyAsync(
  tenantId: string,
  streamId: string,
  descriptionForClassifier: string,
  amount: number,
  date: string,
  currency = "CHF",
  deterministicHint?: ProClassificationHint,
): void {
  // ── Branche déterministe : bypass LLM ────────────────────────────────────
  if (deterministicHint) {
    void (async () => {
      try {
        const amountHt = Math.round((amount / 1.081) * 100) / 100; // TVA 8.1%
        const classifiedEvent = await eventStore.append({
          tenantId,
          streamId,
          event: {
            type: "TransactionClassified",
            payload: {
              transactionStreamId: streamId,
              agent: "pro-bridge-deterministic",
              model: "deterministic",
              confidence: 1.0,
              debitAccount: deterministicHint.debitAccount,
              creditAccount: deterministicHint.creditAccount,
              amountHt,
              amountTtc: amount,
              tvaRate: 8.1,
              tvaCode: "N8",
              costCenter: undefined,
              reasoning: deterministicHint.reasoning,
              citations: [],
              alternatives: [],
            },
          },
          metadata: { durationMs: 0, deterministic: true },
        });

        await queryAsTenant(
          tenantId,
          `INSERT INTO ai_decisions
           (event_id, tenant_id, agent, model, confidence, reasoning, citations, alternatives, duration_ms)
           VALUES ($1, $2, $3, $4, $5, $6, '[]'::jsonb, '[]'::jsonb, $7)`,
          [
            classifiedEvent.id,
            tenantId,
            "pro-bridge-deterministic",
            "deterministic",
            1.0,
            deterministicHint.reasoning,
            0,
          ],
        );

        // Flush immédiat : la vue matérialisée doit refléter l'écriture sans délai
        setTimeout(() => {
          flushLedgerRefresh(tenantId);
        }, 500); // 500ms laisse le temps au TransactionClassified d'être inséré
      } catch (err) {
        console.warn(
          "[bridge] deterministic classify persist failed streamId=%s: %s",
          streamId,
          (err as Error).message,
        );
      }
    })();
    return;
  }

  // ── Branche LLM : comportement existant ─────────────────────────────────
  enqueueLlmCall(tenantId, "classifier", {
    date,
    description: descriptionForClassifier,
    amount,
    currency,
  })
    .then(async (classification) => {
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

        scheduleLedgerRefresh(tenantId);
      } catch (err) {
        console.warn(
          `[bridge] classify persist failed streamId=%s: %s`,
          streamId,
          (err as Error).message,
        );
      }
    })
    .catch((err: Error) => {
      console.warn(`[bridge] classify enqueue failed streamId=%s: %s`, streamId, err.message);
    });
}

// ── Handlers ──────────────────────────────────────────────────────────────────

export async function handleInvoiceCreated(
  tenantId: string,
  rawData: Record<string, unknown>,
  eventTimestamp: string,
): Promise<{ duplicate: boolean }> {
  const parsed = InvoiceCreatedDataSchema.safeParse(rawData);
  if (!parsed.success) {
    console.warn("[bridge] invoice.created — invalid data:", parsed.error.flatten());
    return { duplicate: false };
  }
  const data = parsed.data;

  // Idempotence : vérifier si invoice.created déjà ingéré pour ce proInvoiceId
  const { rows: existing } = await queryAsTenant<{ id: string }>(
    tenantId,
    `SELECT id FROM events
     WHERE tenant_id = $1
       AND type = 'TransactionIngested'
       AND metadata->>'proInvoiceId' = $2
       AND metadata->>'proEvent' = 'invoice.created'
     LIMIT 1`,
    [tenantId, data.invoiceId],
  );
  if (existing.length > 0) {
    console.info("[bridge] invoice.created already ingested, skip invoiceId=%s", data.invoiceId);
    return { duplicate: true };
  }

  const clientName = extractClientName(data);
  // total TTC : préférer amountTtc, sinon total, sinon 0
  const amountTtc = data.amountTtc ?? data.total ?? 0;
  const amountHt = data.amountHt ?? amountTtc / (1 + data.tvaRate / 100);
  const today = new Date().toISOString().slice(0, 10);
  const description = `Facture ${data.invoiceNumber} — ${clientName}`;

  const streamId = randomUUID();

  await eventStore.append({
    tenantId,
    streamId,
    event: {
      type: "TransactionIngested",
      payload: {
        source: "swigs-pro-invoice" as "swigs-pro",
        date: today,
        description,
        amount: amountTtc, // positif = créance (Débiteurs)
        currency: "CHF",
      },
    },
    metadata: {
      source: "swigs-pro",
      proEvent: "invoice.created",
      proInvoiceId: data.invoiceId,
      proInvoiceNumber: data.invoiceNumber,
      proClientName: clientName,
      proAmountHt: amountHt,
      proAmountTtc: amountTtc,
      proTvaRate: data.tvaRate,
      proDueDate: data.dueDate ?? null,
      proEventTimestamp: eventTimestamp,
    },
  });

  console.info(
    "[bridge] invoice.created ingested streamId=%s invoice=%s client=%s amountTtc=%s",
    streamId,
    data.invoiceNumber,
    clientName,
    amountTtc,
  );

  // Créer un document virtuel Pro dans /documents (Phase 3 V1.1)
  try {
    await createProDocument({
      tenantId,
      proInvoiceId: data.invoiceId,
      proEvent: "invoice.created",
      proInvoiceNumber: data.invoiceNumber,
      fileName: `Facture ${data.invoiceNumber} — ${clientName}.pro`,
      description,
      amount: amountTtc,
      date: today,
      streamId,
    });
  } catch (docErr) {
    console.warn("[bridge] createProDocument failed (invoice.created), non-blocking:", (docErr as Error).message);
  }

  // Classification déterministe : 1100 Débiteurs (D) / 3200 Prestations de services (C)
  classifyAsync(tenantId, streamId, description, amountTtc, today, "CHF",
    deterministicProClassification("invoice.created", amountTtc) ?? undefined);
  scheduleLedgerRefresh(tenantId);
  return { duplicate: false };
}

// ── Bloc A — Handler invoice.sent (idempotent via proInvoiceId) ───────────────

export async function handleInvoiceSent(
  tenantId: string,
  rawData: Record<string, unknown>,
  eventTimestamp: string,
): Promise<void> {
  const parsed = InvoiceSentDataSchema.safeParse(rawData);
  if (!parsed.success) {
    console.warn("[bridge] invoice.sent — invalid data:", parsed.error.flatten());
    return;
  }
  const data = parsed.data;

  // Idempotence : vérifier si invoice.created déjà vu pour ce proInvoiceId
  const { rows: existing } = await queryAsTenant<{ id: string; stream_id: string }>(
    tenantId,
    `SELECT id, stream_id FROM events
     WHERE tenant_id = $1
       AND type = 'TransactionIngested'
       AND metadata->>'proInvoiceId' = $2
     ORDER BY occurred_at ASC
     LIMIT 1`,
    [tenantId, data.invoiceId],
  );

  if (existing.length > 0) {
    // Déjà ingéré via invoice.created → appendre un event InvoiceStatusChanged plutôt que dupliquer
    const existingStreamId = existing[0].stream_id;
    await eventStore.append({
      tenantId,
      streamId: existingStreamId,
      event: {
        type: "InvoiceStatusChanged",
        payload: {
          status: "sent",
          sentAt: data.sentAt ?? eventTimestamp,
        },
      },
      metadata: {
        source: "swigs-pro",
        proEvent: "invoice.sent",
        proInvoiceId: data.invoiceId,
        proInvoiceNumber: data.invoiceNumber,
        proEventTimestamp: eventTimestamp,
      },
    });
    console.info(
      "[bridge] invoice.sent — status updated (idempotent) streamId=%s invoice=%s",
      existingStreamId,
      data.invoiceNumber,
    );
    return;
  }

  // Pas encore vu : créer comme invoice.created mais avec source=swigs-pro-invoice-sent
  const clientName = extractClientName(data);
  const amountTtc = data.amountTtc ?? data.total ?? 0;
  const amountHt = data.amountHt ?? amountTtc / (1 + data.tvaRate / 100);
  const today = new Date().toISOString().slice(0, 10);
  const description = `Facture ${data.invoiceNumber} — ${clientName} (envoyée)`;

  const streamId = randomUUID();

  await eventStore.append({
    tenantId,
    streamId,
    event: {
      type: "TransactionIngested",
      payload: {
        source: "swigs-pro-invoice-sent" as "swigs-pro",
        date: today,
        description,
        amount: amountTtc,
        currency: "CHF",
      },
    },
    metadata: {
      source: "swigs-pro",
      proEvent: "invoice.sent",
      proInvoiceId: data.invoiceId,
      proInvoiceNumber: data.invoiceNumber,
      proClientName: clientName,
      proAmountHt: amountHt,
      proAmountTtc: amountTtc,
      proTvaRate: data.tvaRate,
      proDueDate: data.dueDate ?? null,
      proSentAt: data.sentAt ?? null,
      proEventTimestamp: eventTimestamp,
    },
  });

  console.info(
    "[bridge] invoice.sent ingested (new) streamId=%s invoice=%s client=%s amountTtc=%s",
    streamId,
    data.invoiceNumber,
    clientName,
    amountTtc,
  );

  // Créer un document virtuel Pro dans /documents (Phase 3 V1.1)
  try {
    await createProDocument({
      tenantId,
      proInvoiceId: data.invoiceId,
      proEvent: "invoice.sent",
      proInvoiceNumber: data.invoiceNumber,
      fileName: `Facture ${data.invoiceNumber} — ${clientName} (envoyée).pro`,
      description,
      amount: amountTtc,
      date: today,
      streamId,
    });
  } catch (docErr) {
    console.warn("[bridge] createProDocument failed (invoice.sent), non-blocking:", (docErr as Error).message);
  }

  // Classification déterministe : 1100 Débiteurs (D) / 3200 Prestations (C)
  classifyAsync(tenantId, streamId, description, amountTtc, today, "CHF",
    deterministicProClassification("invoice.sent", amountTtc) ?? undefined);
  scheduleLedgerRefresh(tenantId);
}

// ── Bloc B — Handler invoice.paid avec reconciliation automatique ─────────────

export async function handleInvoicePaid(
  tenantId: string,
  rawData: Record<string, unknown>,
  eventTimestamp: string,
): Promise<{ duplicate: boolean }> {
  const parsed = InvoicePaidDataSchema.safeParse(rawData);
  if (!parsed.success) {
    console.warn("[bridge] invoice.paid — invalid data:", parsed.error.flatten());
    return { duplicate: false };
  }
  const data = parsed.data;

  // Idempotence : vérifier si invoice.paid déjà ingéré pour ce proInvoiceId
  const { rows: existingPaid } = await queryAsTenant<{ id: string }>(
    tenantId,
    `SELECT id FROM events
     WHERE tenant_id = $1
       AND type = 'TransactionIngested'
       AND metadata->>'proInvoiceId' = $2
       AND metadata->>'proEvent' = 'invoice.paid'
     LIMIT 1`,
    [tenantId, data.invoiceId],
  );
  if (existingPaid.length > 0) {
    console.info("[bridge] invoice.paid already ingested, skip invoiceId=%s", data.invoiceId);
    return { duplicate: true };
  }

  const clientName = extractClientName(data);
  const amountTtc = data.amountTtc ?? data.total ?? 0;
  const paidDate = data.paidAt
    ? new Date(data.paidAt).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  const description = `Paiement facture ${data.invoiceNumber} — ${clientName}`;

  // Dedup fingerprint : chercher une écriture bancaire déjà ingérée (ex: CAMT manuel)
  const fingerprint = computeFingerprint({
    amount: amountTtc,
    date: paidDate,
    description,
  });

  // Chercher la facture originale pour reconciliation (utile même en cas de dedup)
  let linkedInvoiceStreamId: string | null = null;
  try {
    const { rows: originals } = await queryAsTenant<{ stream_id: string }>(
      tenantId,
      `SELECT stream_id FROM events
       WHERE tenant_id = $1
         AND type = 'TransactionIngested'
         AND metadata->>'proInvoiceId' = $2
         AND metadata->>'proEvent' IN ('invoice.created', 'invoice.sent')
       ORDER BY occurred_at ASC
       LIMIT 1`,
      [tenantId, data.invoiceId],
    );
    linkedInvoiceStreamId = originals[0]?.stream_id ?? null;
  } catch (err) {
    console.warn("[bridge] invoice.paid — reconciliation lookup failed:", (err as Error).message);
  }

  const existingEntry = await lookupByFingerprint(tenantId, fingerprint);
  if (existingEntry) {
    console.info(
      "[bridge] invoice.paid — bank entry already exists (fingerprint match), enriching only streamId=%s",
      existingEntry.streamId,
    );
    await enrichEventMetadata(tenantId, existingEntry.eventId, {
      reconciles: linkedInvoiceStreamId ?? null,
      proInvoiceId: data.invoiceId,
      proInvoiceNumber: data.invoiceNumber,
      proPaidAt: data.paidAt ?? null,
    });
    scheduleLedgerRefresh(tenantId);
    return { duplicate: true };
  }

  // Log reconciliation result
  if (linkedInvoiceStreamId) {
    console.info(
      "[bridge] invoice.paid — found linked invoice streamId=%s for invoiceId=%s",
      linkedInvoiceStreamId,
      data.invoiceId,
    );
  } else {
    console.warn(
      "[bridge] invoice.paid — no linked invoice found for invoiceId=%s (reconciliation skipped)",
      data.invoiceId,
    );
  }

  const streamId = randomUUID();

  await eventStore.append({
    tenantId,
    streamId,
    event: {
      type: "TransactionIngested",
      payload: {
        source: "swigs-pro-payment" as "swigs-pro",
        date: paidDate,
        description,
        amount: amountTtc, // positif = encaissement banque
        currency: "CHF",
      },
    },
    metadata: {
      source: "swigs-pro",
      proEvent: "invoice.paid",
      proInvoiceId: data.invoiceId,
      proInvoiceNumber: data.invoiceNumber,
      proClientName: clientName,
      proAmountTtc: amountTtc,
      proPaidAt: data.paidAt ?? null,
      proEventTimestamp: eventTimestamp,
      fingerprint, // dedup cross-source
      // Reconciliation : lien vers le stream_id de la facture originale
      ...(linkedInvoiceStreamId ? { reconciles: linkedInvoiceStreamId } : {}),
    },
  });

  console.info(
    "[bridge] invoice.paid ingested streamId=%s invoice=%s client=%s amount=%s reconciles=%s",
    streamId,
    data.invoiceNumber,
    clientName,
    amountTtc,
    linkedInvoiceStreamId ?? "none",
  );

  // Créer un document virtuel Pro dans /documents (Phase 3 V1.1)
  try {
    await createProDocument({
      tenantId,
      proInvoiceId: data.invoiceId,
      proEvent: "invoice.paid",
      proInvoiceNumber: data.invoiceNumber,
      fileName: `Paiement facture ${data.invoiceNumber} — ${clientName}.pro`,
      description,
      amount: amountTtc,
      date: paidDate,
      streamId,
    });
  } catch (docErr) {
    console.warn("[bridge] createProDocument failed (invoice.paid), non-blocking:", (docErr as Error).message);
  }

  // Classification déterministe : 1020 Banque (D) / 1100 Débiteurs (C) — réconciliation
  classifyAsync(tenantId, streamId, description, amountTtc, paidDate, "CHF",
    deterministicProClassification("invoice.paid", amountTtc) ?? undefined);
  scheduleLedgerRefresh(tenantId);
  return { duplicate: false };
}

export async function handleExpenseSubmitted(
  tenantId: string,
  rawData: Record<string, unknown>,
  eventTimestamp: string,
): Promise<{ duplicate: boolean }> {
  const parsed = ExpenseSubmittedDataSchema.safeParse(rawData);
  if (!parsed.success) {
    console.warn("[bridge] expense.submitted — invalid data:", parsed.error.flatten());
    return { duplicate: false };
  }
  const data = parsed.data;

  // Idempotence : vérifier si expense.submitted déjà ingéré pour ce proExpenseId
  const { rows: existingExpense } = await queryAsTenant<{ id: string }>(
    tenantId,
    `SELECT id FROM events
     WHERE tenant_id = $1
       AND type = 'TransactionIngested'
       AND metadata->>'proExpenseId' = $2
       AND metadata->>'proEvent' = 'expense.submitted'
     LIMIT 1`,
    [tenantId, data.expenseId],
  );
  if (existingExpense.length > 0) {
    console.info("[bridge] expense.submitted already ingested, skip expenseId=%s", data.expenseId);
    return { duplicate: true };
  }

  const today = data.date ?? new Date().toISOString().slice(0, 10);
  const descriptionParts = [
    "Note de frais",
    data.category,
    data.description,
    data.supplierName,
  ].filter(Boolean);
  const description = descriptionParts.join(" — ");

  const streamId = randomUUID();

  await eventStore.append({
    tenantId,
    streamId,
    event: {
      type: "TransactionIngested",
      payload: {
        source: "swigs-pro-expense" as "swigs-pro",
        date: today,
        description,
        amount: -data.amount, // négatif = décaissement (sortie banque)
        currency: data.currency,
      },
    },
    metadata: {
      source: "swigs-pro",
      proEvent: "expense.submitted",
      proExpenseId: data.expenseId,
      proCategory: data.category ?? null,
      proSupplierName: data.supplierName ?? null,
      proEventTimestamp: eventTimestamp,
    },
  });

  console.info(
    "[bridge] expense.submitted ingested streamId=%s expense=%s amount=%s",
    streamId,
    data.expenseId,
    data.amount,
  );

  // Créer un document virtuel Pro dans /documents (Phase 3 V1.1)
  try {
    await createProDocument({
      tenantId,
      proExpenseId: data.expenseId,
      proEvent: "expense.submitted",
      fileName: `Note de frais ${data.expenseId} — ${data.description}.pro`,
      description,
      amount: -data.amount, // négatif = décaissement
      date: today,
      streamId,
    });
  } catch (docErr) {
    console.warn("[bridge] createProDocument failed (expense.submitted), non-blocking:", (docErr as Error).message);
  }

  // Classification déterministe : 6500 Frais admin (D) / 1020 Banque (C)
  classifyAsync(tenantId, streamId, description, -data.amount, today, data.currency,
    deterministicProClassification("expense.submitted", data.amount) ?? undefined);
  scheduleLedgerRefresh(tenantId);
  return { duplicate: false };
}

// ── Handler bank.transaction (Swigs Pro bankImapFetcher) ─────────────────────

export async function handleBankTransaction(
  tenantId: string,
  rawData: Record<string, unknown>,
  eventTimestamp: string,
): Promise<{ duplicate: boolean }> {
  const parsed = BankTransactionDataSchema.safeParse(rawData);
  if (!parsed.success) {
    console.warn("[bridge] bank.transaction — invalid data:", parsed.error.flatten());
    return { duplicate: false };
  }
  const data = parsed.data;

  const bankDate = data.date.slice(0, 10);

  // ── 1. PRIORITÉ : dedup intra-Pro par proBankTxId (strict, évite collisions Revolut) ──
  if (data.bankTxId) {
    const { rows: existingById } = await queryAsTenant(
      tenantId,
      `SELECT id, stream_id FROM events
       WHERE tenant_id = $1
         AND type = 'TransactionIngested'
         AND metadata->>'proBankTxId' = $2
       LIMIT 1`,
      [tenantId, data.bankTxId],
    );
    if (existingById.length > 0) {
      console.info(
        "[bridge] bank.transaction already ingested (proBankTxId=%s), skip",
        data.bankTxId,
      );
      return { duplicate: true };
    }
  }

  // ── 2. SECONDAIRE : fingerprint cross-source (CAMT.053 vs Pro paiement) ──
  const fingerprint = computeFingerprint({
    amount: Math.abs(data.amount),
    date: bankDate,
    description: data.description,
    iban: data.iban,
    bankRef: data.bankRef,
  });

  const existingByFp = await lookupByFingerprint(tenantId, fingerprint);
  if (existingByFp) {
    // Cross-source match : enrichir l'entrée CAMT existante avec le proBankTxId
    console.info(
      "[bridge] bank.transaction — fingerprint cross-source match, enriching streamId=%s",
      existingByFp.streamId,
    );
    await enrichEventMetadata(tenantId, existingByFp.eventId, {
      proBankTxId: data.bankTxId ?? null,
      proSource: "bank.transaction",
      proBankRef: data.bankRef ?? null,
      proEventTimestamp: eventTimestamp,
    });
    return { duplicate: true };
  }

  // ── 3. INSERT nouveau event ──────────────────────────────────────────────────
  const streamId = randomUUID();

  const description = [
    data.description,
    data.counterpartyName,
  ].filter(Boolean).join(" | ") || "(bank transaction)";

  await eventStore.append({
    tenantId,
    streamId,
    event: {
      type: "TransactionIngested",
      payload: {
        source: "swigs-pro-bank",
        date: bankDate,
        description,
        amount: data.amount, // signe déjà porté par Pro
        currency: data.currency,
        counterpartyIban: data.iban,
      },
    },
    metadata: {
      source: "swigs-pro-bank",
      proEvent: "bank.transaction",
      proBankTxId: data.bankTxId ?? null,
      proEventTimestamp: eventTimestamp,
      fingerprint,
      bankRef: data.bankRef ?? null,
      counterpartyName: data.counterpartyName ?? null,
    },
  });

  console.info(
    "[bridge] bank.transaction ingested streamId=%s bankTxId=%s amount=%s date=%s",
    streamId,
    data.bankTxId ?? "n/a",
    data.amount,
    bankDate,
  );

  // Pas de hint déterministe : fallback LLM classifier (loyer/salaires/achats/etc.)
  classifyAsync(tenantId, streamId, description, data.amount, bankDate, data.currency,
    deterministicProClassification("bank.transaction", data.amount) ?? undefined);
  scheduleLedgerRefresh(tenantId);
  return { duplicate: false };
}

// ── Route principale ──────────────────────────────────────────────────────────

/**
 * POST /bridge/pro-events
 *
 * Point d'entrée pour les events Swigs Pro → Lexa.
 * Authentifié par HMAC (requireHmac : X-Lexa-Signature: sha256=<hex>).
 *
 * Body générique :
 *   { event: string, timestamp?: string, tenantId?: string, data?: object, payload?: object }
 *
 * data/payload : champ polymorphe — on accepte les deux alias (Hub EventBus utilise `payload`
 * pour les publishments internes, mais on peut recevoir `data` depuis un appel direct).
 */
bridgeRouter.post("/pro-events", requireHmac, async (req, res) => {
  const parsed = BridgeEventSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid body", details: parsed.error.flatten() });
  }

  const { event, timestamp, tenantId: rawTenantId, hubUserId } = parsed.data;
  const eventData = (parsed.data.data ?? parsed.data.payload ?? {}) as Record<string, unknown>;

  // Résoudre le tenantId via la fallback chain (Bloc C)
  const rawId = rawTenantId ?? hubUserId ?? DEFAULT_TENANT_ID;
  const tenantId = await resolveTenantId(rawId);

  const eventTimestamp = timestamp ?? new Date().toISOString();

  // Toggle Pro sync côté Lexa (Phase 3 V1.1) — vérifier si le tenant accepte les events Pro
  try {
    const proSyncOn = await isProSyncEnabled(tenantId);
    if (!proSyncOn) {
      console.info("[bridge] pro sync disabled for tenant=%s, ignoring event=%s", tenantId, event);
      return res.status(202).json({ ok: false, reason: "pro_sync_disabled", tenantId });
    }
  } catch (syncErr) {
    // Ne pas bloquer si la vérif échoue — fail open (comportement V1 par défaut)
    console.warn("[bridge] isProSyncEnabled check failed, proceeding:", (syncErr as Error).message);
  }

  // Multi-tenant safety : rejeter en production si aucun mapping trouvé (DEFAULT_TENANT_ID)
  if (tenantId === DEFAULT_TENANT_ID && process.env.NODE_ENV === "production") {
    console.warn("[bridge] unmapped Pro event in production, rejecting", { event, rawId });
    return res.status(202).json({
      ok: false,
      reason: "no_tenant_mapping",
      message: "hubUserId not mapped to a Lexa tenant — use POST /bridge/admin/pro-lexa-mapping to link",
    });
  }

  try {
    let result: { duplicate: boolean };

    switch (event) {
      case "invoice.created":
        result = await handleInvoiceCreated(tenantId, eventData, eventTimestamp);
        break;

      case "invoice.sent":
        await handleInvoiceSent(tenantId, eventData, eventTimestamp);
        result = { duplicate: false }; // handleInvoiceSent gère l'idempotence en interne
        break;

      case "invoice.paid":
        result = await handleInvoicePaid(tenantId, eventData, eventTimestamp);
        break;

      case "expense.submitted":
        result = await handleExpenseSubmitted(tenantId, eventData, eventTimestamp);
        break;

      case "bank.transaction":
        result = await handleBankTransaction(tenantId, eventData, eventTimestamp);
        break;

      default:
        console.log("[bridge] ignored unknown event type:", event);
        return res.status(200).json({ ok: true, ignored: true, event });
    }

    if (result.duplicate) {
      return res.status(200).json({ ok: true, duplicate: true, event, tenantId });
    }
    return res.status(201).json({ ok: true, event, tenantId });
  } catch (err) {
    console.error("[bridge] pro-events handler error event=%s:", event, (err as Error).message);
    return res.status(500).json({ error: "event processing failed", message: (err as Error).message });
  }
});

// ── Admin endpoint — Gestion manuelle du mapping Pro ↔ Lexa ──────────────────

/**
 * POST /bridge/admin/pro-lexa-mapping
 *
 * Créer ou mettre à jour un mapping hubUserId → lexaTenantId manuellement.
 * Auth : X-Admin-Secret header (même secret que /auth/admin/*)
 *
 * Body : { proHubUserId: string, lexaTenantId: string (UUID) }
 */
bridgeRouter.post("/admin/pro-lexa-mapping", async (req, res) => {
  // Import dynamique config pour éviter une dépendance circulaire
  const { config } = await import("../config/index.js");
  const headerSecret = req.header("X-Admin-Secret") ?? "";
  if (headerSecret !== config.ADMIN_SECRET) {
    return res.status(403).json({ error: "forbidden" });
  }

  const bodySchema = z.object({
    proHubUserId: z.string().min(1),
    lexaTenantId: z.string().uuid(),
  });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid body", details: parsed.error.flatten() });
  }

  const { proHubUserId, lexaTenantId } = parsed.data;

  try {
    await query(
      `INSERT INTO pro_lexa_tenant_map (pro_hub_user_id, lexa_tenant_id)
       VALUES ($1, $2)
       ON CONFLICT (pro_hub_user_id) DO UPDATE
         SET lexa_tenant_id = EXCLUDED.lexa_tenant_id,
             last_seen_at   = now()`,
      [proHubUserId, lexaTenantId],
    );
    console.info("[bridge] admin mapping upserted: %s → %s", proHubUserId, lexaTenantId);
    return res.status(200).json({ ok: true, proHubUserId, lexaTenantId });
  } catch (err) {
    console.error("[bridge] admin mapping error:", (err as Error).message);
    return res.status(500).json({ error: "mapping failed", message: (err as Error).message });
  }
});

/**
 * GET /bridge/admin/pro-lexa-mapping
 *
 * Lister tous les mappings existants.
 * Auth : X-Admin-Secret header
 */
bridgeRouter.get("/admin/pro-lexa-mapping", async (req, res) => {
  const { config } = await import("../config/index.js");
  const headerSecret = req.header("X-Admin-Secret") ?? "";
  if (headerSecret !== config.ADMIN_SECRET) {
    return res.status(403).json({ error: "forbidden" });
  }

  try {
    const result = await query<{
      pro_hub_user_id: string;
      lexa_tenant_id: string;
      created_at: Date;
      last_seen_at: Date;
    }>(`SELECT * FROM pro_lexa_tenant_map ORDER BY last_seen_at DESC`);
    return res.json({ count: result.rows.length, mappings: result.rows });
  } catch (err) {
    return res.status(500).json({ error: "query failed", message: (err as Error).message });
  }
});
