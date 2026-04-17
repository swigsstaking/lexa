/**
 * bridge.ts — Route POST /bridge/pro-events
 *
 * Intégration bidirectionnelle Swigs Pro → Lexa (Phase 3 V1.2).
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
 *   invoice.paid     → TransactionIngested source=swigs-pro-payment
 *                      + TransactionClassified auto (1020 / 1100)
 *   expense.submitted → TransactionIngested source=swigs-pro-expense
 *                       + TransactionClassified auto (6500 / 1020)
 *
 * Tenant mapping :
 *   V1 — tenantId du payload utilisé tel quel (UUID identique Lexa/Pro via Swigs Hub SSO).
 *   Si absent : fallback sur DEFAULT_TENANT_ID (00000000-0000-0000-0000-000000000001).
 *   V2 : table pro_lexa_tenant_map à implémenter si tenants divergent.
 */

import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { eventStore } from "../events/EventStore.js";
import { enqueueLlmCall } from "../services/LlmQueue.js";
import { scheduleLedgerRefresh } from "../services/LedgerRefresh.js";
import { requireHmac } from "../middleware/requireHmac.js";
import { queryAsTenant } from "../db/postgres.js";
import type { ClassificationResult } from "../agents/classifier/ClassifierAgent.js";

export const bridgeRouter = Router();

const DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001";

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

const BridgeEventSchema = z.object({
  event: z.string(),
  timestamp: z.string().optional(),
  tenantId: z.string().uuid().optional(),
  hubUserId: z.string().optional(),
  data: z.record(z.unknown()).optional(),
  payload: z.record(z.unknown()).optional(), // alias alternatif
});

// ── Helpers ───────────────────────────────────────────────────────────────────

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
 */
function classifyAsync(
  tenantId: string,
  streamId: string,
  descriptionForClassifier: string,
  amount: number,
  date: string,
  currency = "CHF",
): void {
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

async function handleInvoiceCreated(
  tenantId: string,
  rawData: Record<string, unknown>,
  eventTimestamp: string,
): Promise<void> {
  const parsed = InvoiceCreatedDataSchema.safeParse(rawData);
  if (!parsed.success) {
    console.warn("[bridge] invoice.created — invalid data:", parsed.error.flatten());
    return;
  }
  const data = parsed.data;

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

  // Classification auto : 1100 Débiteurs (D) / 3200 Prestations de services (C)
  classifyAsync(tenantId, streamId, description, amountTtc, today);
  scheduleLedgerRefresh(tenantId);
}

async function handleInvoicePaid(
  tenantId: string,
  rawData: Record<string, unknown>,
  eventTimestamp: string,
): Promise<void> {
  const parsed = InvoicePaidDataSchema.safeParse(rawData);
  if (!parsed.success) {
    console.warn("[bridge] invoice.paid — invalid data:", parsed.error.flatten());
    return;
  }
  const data = parsed.data;

  const clientName = extractClientName(data);
  const amountTtc = data.amountTtc ?? data.total ?? 0;
  const paidDate = data.paidAt
    ? new Date(data.paidAt).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  const description = `Paiement facture ${data.invoiceNumber} — ${clientName}`;

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
    },
  });

  console.info(
    "[bridge] invoice.paid ingested streamId=%s invoice=%s client=%s amount=%s",
    streamId,
    data.invoiceNumber,
    clientName,
    amountTtc,
  );

  // Classification auto : 1020 Banque (D) / 1100 Débiteurs (C) — réconciliation
  classifyAsync(tenantId, streamId, description, amountTtc, paidDate);
  scheduleLedgerRefresh(tenantId);
}

async function handleExpenseSubmitted(
  tenantId: string,
  rawData: Record<string, unknown>,
  eventTimestamp: string,
): Promise<void> {
  const parsed = ExpenseSubmittedDataSchema.safeParse(rawData);
  if (!parsed.success) {
    console.warn("[bridge] expense.submitted — invalid data:", parsed.error.flatten());
    return;
  }
  const data = parsed.data;

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

  // Classification auto : 6500 Frais admin (D) / 1020 Banque (C)
  classifyAsync(tenantId, streamId, description, -data.amount, today, data.currency);
  scheduleLedgerRefresh(tenantId);
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

  const { event, timestamp, tenantId: rawTenantId } = parsed.data;
  const eventData = (parsed.data.data ?? parsed.data.payload ?? {}) as Record<string, unknown>;
  const tenantId = rawTenantId ?? DEFAULT_TENANT_ID;
  const eventTimestamp = timestamp ?? new Date().toISOString();

  try {
    switch (event) {
      case "invoice.created":
        await handleInvoiceCreated(tenantId, eventData, eventTimestamp);
        break;

      case "invoice.paid":
        await handleInvoicePaid(tenantId, eventData, eventTimestamp);
        break;

      case "expense.submitted":
        await handleExpenseSubmitted(tenantId, eventData, eventTimestamp);
        break;

      default:
        console.log("[bridge] ignored unknown event type:", event);
        return res.status(200).json({ ok: true, ignored: true, event });
    }

    return res.status(201).json({ ok: true, event, tenantId });
  } catch (err) {
    console.error("[bridge] pro-events handler error event=%s:", event, (err as Error).message);
    return res.status(500).json({ error: "event processing failed", message: (err as Error).message });
  }
});
