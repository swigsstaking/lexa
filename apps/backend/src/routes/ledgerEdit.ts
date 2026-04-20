/**
 * Lexa V1.1 — Édition comptable depuis le grand livre
 *
 * Endpoints append-only (event-sourcing pur) :
 *   POST   /ledger/entries                       — création manuelle d'une écriture
 *   PATCH  /ledger/entries/:streamId/correct     — correction d'une écriture existante
 *   POST   /ledger/lettrage                      — lettrage de plusieurs streams
 *   DELETE /ledger/lettrage/:letterRef           — délettrage
 *   GET    /ledger/entries/:streamId/history     — historique complet d'un stream
 *
 * Invariants :
 *   - Jamais de UPDATE/DELETE sur la table events
 *   - Toute correction = nouvel event TransactionCorrected dans le même stream
 *   - Tout lettrage = event TransactionsLettered (un par stream concerné)
 *   - Tout délettrage = event TransactionsUnlettered (un par stream concerné)
 *   - scheduleLedgerRefresh(tenantId) appelé après chaque mutation
 */

import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { eventStore } from "../events/EventStore.js";
import { queryAsTenant } from "../db/postgres.js";
import { scheduleLedgerRefresh, flushLedgerRefresh } from "../services/LedgerRefresh.js";

export const ledgerEditRouter = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Génère un letterRef séquentiel : "L-YYYY-MM-NNN" (ex: "L-2026-04-001") */
async function generateLetterRef(tenantId: string, date: Date): Promise<string> {
  const yyyy = date.getFullYear().toString();
  const mm   = String(date.getMonth() + 1).padStart(2, "0");
  const prefix = `L-${yyyy}-${mm}-`;

  // Compte les lettrage de ce mois pour ce tenant (events TransactionsLettered)
  const result = await queryAsTenant<{ count: string }>(
    tenantId,
    `SELECT COUNT(DISTINCT payload->>'letterRef')::text AS count
     FROM events
     WHERE tenant_id = $1
       AND type = 'TransactionsLettered'
       AND payload->>'letterRef' LIKE $2`,
    [tenantId, `${prefix}%`],
  );

  const seq = Number(result.rows[0]?.count ?? 0) + 1;
  return `${prefix}${String(seq).padStart(3, "0")}`;
}

// ─── Validation Schemas ────────────────────────────────────────────────────────

const CreateEntrySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  description: z.string().min(1).max(500),
  debitAccount: z.string().min(3).max(10),
  creditAccount: z.string().min(3).max(10),
  amountTtc: z.number().positive(),
  amountHt: z.number().optional(),
  tvaRate: z.number().min(0).max(100).optional(),
  tvaCode: z.string().optional(),
  costCenter: z.string().optional(),
  reasoning: z.string().optional(),
});

const CorrectEntrySchema = z.object({
  debitAccount: z.string().min(3).max(10).optional(),
  creditAccount: z.string().min(3).max(10).optional(),
  amountTtc: z.number().positive().optional(),
  description: z.string().min(1).max(500).optional(),
  reasoning: z.string().min(1, "reasoning est obligatoire pour l'audit trail"),
});

const LettrageSchema = z.object({
  streamIds: z.array(z.string().uuid()).min(2, "minimum 2 streams pour le lettrage"),
  letterRef: z.string().optional(),
});

// ─── UUID validation helper ────────────────────────────────────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── POST /ledger/entries — création manuelle d'une écriture ─────────────────
ledgerEditRouter.post("/entries", async (req, res) => {
  const parsed = CreateEntrySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid body", details: parsed.error.flatten() });
  }

  const {
    date, description, debitAccount, creditAccount,
    amountTtc, amountHt, tvaRate, tvaCode, costCenter, reasoning,
  } = parsed.data;

  const tenantId = req.tenantId;
  const userId   = req.user?.sub ?? "unknown";
  const streamId = randomUUID();

  try {
    // Event 1 : TransactionIngested (source=manual)
    const ingestedEvent = await eventStore.append({
      tenantId,
      streamId,
      event: {
        type: "TransactionIngested",
        payload: {
          source: "manual",
          date,
          description,
          amount: amountTtc, // convention : amount = TTC côté bank view
          currency: "CHF",
        },
      },
      metadata: {
        createdByUserId: userId,
        requestId: req.header("x-request-id") ?? randomUUID(),
      },
    });

    // Event 2 : TransactionClassified (agent=user-manual, confidence=1)
    const classifiedEvent = await eventStore.append({
      tenantId,
      streamId,
      event: {
        type: "TransactionClassified",
        payload: {
          transactionStreamId: streamId,
          agent: "user-manual",
          model: "user-manual",
          confidence: 1,
          debitAccount,
          creditAccount,
          amountHt: amountHt ?? amountTtc,
          amountTtc,
          tvaRate: tvaRate ?? 0,
          tvaCode: tvaCode ?? "EXC",
          costCenter,
          reasoning: reasoning ?? "Création manuelle",
          citations: [],
        },
      },
      metadata: { createdByUserId: userId },
    });

    // Flush synchrone pour que le client voie les changements immédiatement
    await flushLedgerRefresh(tenantId);

    return res.status(201).json({
      streamId,
      eventId: classifiedEvent.id,
      createdAt: classifiedEvent.occurredAt,
      events: {
        ingested:   { id: ingestedEvent.id,   sequence: ingestedEvent.sequence },
        classified: { id: classifiedEvent.id, sequence: classifiedEvent.sequence },
      },
    });
  } catch (err) {
    console.error("[ledgerEdit] create entry error:", err);
    return res.status(500).json({ error: "création écriture échouée", message: (err as Error).message });
  }
});

// ─── PATCH /ledger/entries/:streamId/correct — correction append-only ─────────
ledgerEditRouter.patch("/entries/:streamId/correct", async (req, res) => {
  const { streamId } = req.params;
  if (!streamId || !UUID_RE.test(streamId)) {
    return res.status(400).json({ error: "invalid streamId" });
  }

  const parsed = CorrectEntrySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid body", details: parsed.error.flatten() });
  }

  const { debitAccount, creditAccount, amountTtc, description, reasoning } = parsed.data;
  const tenantId = req.tenantId;
  const userId   = req.user?.sub ?? "unknown";

  // Vérifier que le stream existe
  const existing = await eventStore.readStream({ tenantId, streamId });
  if (existing.length === 0) {
    return res.status(404).json({ error: "stream not found" });
  }

  // Récupérer la dernière classification pour exposer oldClassification
  const oldClassified = existing
    .filter((e) => e.type === "TransactionClassified" || e.type === "TransactionCorrected")
    .at(-1);

  try {
    const correctedEvent = await eventStore.append({
      tenantId,
      streamId,
      event: {
        type: "TransactionCorrected",
        payload: {
          transactionStreamId: streamId,
          ...(debitAccount  !== undefined ? { debitAccount }  : {}),
          ...(creditAccount !== undefined ? { creditAccount } : {}),
          ...(amountTtc     !== undefined ? { amountTtc }     : {}),
          ...(description   !== undefined ? { description }   : {}),
          reasoning,
          correctedByUserId: userId,
        },
      },
      metadata: { correctedByUserId: userId },
    });

    // Flush synchrone pour que le client voie les changements immédiatement
    await flushLedgerRefresh(tenantId);

    return res.json({
      streamId,
      eventId: correctedEvent.id,
      oldClassification: oldClassified
        ? { type: oldClassified.type, payload: oldClassified.payload }
        : null,
      newClassification: {
        debitAccount:  debitAccount  ?? null,
        creditAccount: creditAccount ?? null,
        amountTtc:     amountTtc     ?? null,
        description:   description   ?? null,
        reasoning,
      },
    });
  } catch (err) {
    console.error("[ledgerEdit] correct entry error:", err);
    return res.status(500).json({ error: "correction échouée", message: (err as Error).message });
  }
});

// ─── POST /ledger/lettrage — lettrage de plusieurs streams ────────────────────
ledgerEditRouter.post("/lettrage", async (req, res) => {
  const parsed = LettrageSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid body", details: parsed.error.flatten() });
  }

  const { streamIds, letterRef: providedRef } = parsed.data;
  const tenantId = req.tenantId;
  const userId   = req.user?.sub ?? "unknown";
  const now      = new Date();

  // Vérifier que tous les streams existent
  for (const sid of streamIds) {
    const events = await eventStore.readStream({ tenantId, streamId: sid });
    if (events.length === 0) {
      return res.status(404).json({ error: `stream not found: ${sid}` });
    }
  }

  try {
    const letterRef = providedRef ?? (await generateLetterRef(tenantId, now));

    // Appender un TransactionsLettered dans chaque stream concerné
    const appended: number[] = [];
    for (const sid of streamIds) {
      const ev = await eventStore.append({
        tenantId,
        streamId: sid,
        event: {
          type: "TransactionsLettered",
          payload: {
            transactionStreamId: sid,
            letterRef,
            letteredByUserId: userId,
          },
        },
        metadata: { letteredByUserId: userId },
        occurredAt: now,
      });
      appended.push(ev.id);
    }

    // Flush synchrone pour que le client voie les changements immédiatement
    await flushLedgerRefresh(tenantId);

    return res.status(201).json({
      letterRef,
      streamIds,
      letteredAt: now.toISOString(),
      eventIds: appended,
    });
  } catch (err) {
    console.error("[ledgerEdit] lettrage error:", err);
    return res.status(500).json({ error: "lettrage échoué", message: (err as Error).message });
  }
});

// ─── DELETE /ledger/lettrage/:letterRef — délettrage ─────────────────────────
ledgerEditRouter.delete("/lettrage/:letterRef", async (req, res) => {
  const { letterRef } = req.params;
  if (!letterRef || letterRef.length < 3) {
    return res.status(400).json({ error: "invalid letterRef" });
  }

  const tenantId = req.tenantId;
  const userId   = req.user?.sub ?? "unknown";
  const now      = new Date();

  // Trouver tous les streams ayant ce letterRef
  type LetterRow = { stream_id: string };
  const result = await queryAsTenant<LetterRow>(
    tenantId,
    `SELECT DISTINCT stream_id
     FROM events
     WHERE tenant_id = $1
       AND type = 'TransactionsLettered'
       AND payload->>'letterRef' = $2`,
    [tenantId, letterRef],
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: `letterRef not found: ${letterRef}` });
  }

  try {
    const unletteredStreamIds: string[] = [];

    for (const row of result.rows) {
      const sid = row.stream_id;
      await eventStore.append({
        tenantId,
        streamId: sid,
        event: {
          type: "TransactionsUnlettered",
          payload: {
            transactionStreamId: sid,
            letterRef,
            unletteredByUserId: userId,
          },
        },
        metadata: { unletteredByUserId: userId },
        occurredAt: now,
      });
      unletteredStreamIds.push(sid);
    }

    // Flush synchrone pour que le client voie les changements immédiatement
    await flushLedgerRefresh(tenantId);

    return res.json({
      ok: true,
      letterRef,
      unletteredStreamIds,
      unletteredAt: now.toISOString(),
    });
  } catch (err) {
    console.error("[ledgerEdit] unlettrage error:", err);
    return res.status(500).json({ error: "délettrage échoué", message: (err as Error).message });
  }
});

// ─── GET /ledger/entries/:streamId/history — audit trail complet ──────────────
ledgerEditRouter.get("/entries/:streamId/history", async (req, res) => {
  const { streamId } = req.params;
  if (!streamId || !UUID_RE.test(streamId)) {
    return res.status(400).json({ error: "invalid streamId" });
  }

  const events = await eventStore.readStream({ tenantId: req.tenantId, streamId });

  if (events.length === 0) {
    return res.status(404).json({ error: "stream not found" });
  }

  return res.json({
    streamId,
    eventCount: events.length,
    events: events.map((e) => ({
      type:       e.type,
      occurredAt: e.occurredAt,
      payload:    e.payload,
      metadata:   e.metadata,
    })),
  });
});
