/**
 * ppCrypto — routes API crypto wallets + snapshots
 *
 * Montées sur /api/pp/crypto (via app.ts)
 * Toutes les requêtes PG passent par queryAsTenant() (RLS obligatoire).
 *
 * Routes :
 *   POST   /wallet              → ajouter un wallet
 *   GET    /wallet              → liste wallets avec dernier snapshot
 *   DELETE /wallet/:id          → supprimer un wallet
 *   POST   /snapshot/refresh    → enqueue job snapshot manuel
 *   GET    /snapshot?year=2026  → snapshots + total CHF
 */

import { Router } from "express";
import { z } from "zod";
import { queryAsTenant } from "../db/postgres.js";
import { enqueueSingleSnapshot } from "../jobs/cryptoSnapshot.js";

export const ppCryptoRouter = Router();

// ── Schémas de validation ─────────────────────────────────────────────────────

const addWalletSchema = z.object({
  chain: z.enum(["eth", "btc", "sol"]),
  address: z.string().min(10).max(128).trim(),
  label: z.string().max(100).optional(),
});

const snapshotRefreshSchema = z.object({
  wallet_id: z.string().uuid(),
  year: z.number().int().min(2020).max(2100).optional(),
});

const snapshotQuerySchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100).default(new Date().getFullYear() - 1),
});

// ── POST /wallet ──────────────────────────────────────────────────────────────

ppCryptoRouter.post("/wallet", async (req, res) => {
  const parse = addWalletSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: "invalid body", details: parse.error.flatten() });
  }

  const { chain, address, label } = parse.data;
  const tenantId = req.tenantId;
  const userId = req.user?.sub ?? req.user?.tenantId ?? "unknown";

  try {
    const { rows } = await queryAsTenant<{
      id: string;
      tenant_id: string;
      chain: string;
      address: string;
      label: string | null;
      created_at: string;
    }>(
      tenantId,
      `INSERT INTO pp_crypto_wallets (tenant_id, user_id, chain, address, label)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (tenant_id, chain, address) DO NOTHING
       RETURNING id, tenant_id, chain, address, label, created_at`,
      [tenantId, userId, chain, address, label ?? null],
    );

    if (rows.length === 0) {
      return res.status(409).json({ error: "wallet already exists for this chain+address" });
    }

    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error("[ppCrypto] POST /wallet error:", (err as Error).message);
    return res.status(500).json({ error: "internal" });
  }
});

// ── GET /wallet ───────────────────────────────────────────────────────────────

ppCryptoRouter.get("/wallet", async (req, res) => {
  const tenantId = req.tenantId;

  try {
    const { rows } = await queryAsTenant<{
      id: string;
      chain: string;
      address: string;
      label: string | null;
      created_at: string;
      last_snapshot_year: number | null;
      last_snapshot_balance_native: string | null;
      last_snapshot_balance_chf: string | null;
      last_snapshot_price_chf: string | null;
      last_snapshot_at: string | null;
    }>(
      tenantId,
      `SELECT
         w.id,
         w.chain,
         w.address,
         w.label,
         w.created_at,
         s.year                   AS last_snapshot_year,
         s.balance_native::text   AS last_snapshot_balance_native,
         s.balance_chf::text      AS last_snapshot_balance_chf,
         s.price_chf_at_31_12::text AS last_snapshot_price_chf,
         s.snapshotted_at         AS last_snapshot_at
       FROM pp_crypto_wallets w
       LEFT JOIN LATERAL (
         SELECT year, balance_native, balance_chf, price_chf_at_31_12, snapshotted_at
         FROM pp_crypto_snapshots
         WHERE wallet_id = w.id
         ORDER BY year DESC
         LIMIT 1
       ) s ON true
       WHERE w.tenant_id = $1
       ORDER BY w.created_at DESC`,
      [tenantId],
    );

    const wallets = rows.map((r) => ({
      id: r.id,
      chain: r.chain,
      address: r.address,
      label: r.label,
      created_at: r.created_at,
      last_snapshot: r.last_snapshot_year !== null
        ? {
            year: r.last_snapshot_year,
            balance_native: r.last_snapshot_balance_native,
            balance_chf: r.last_snapshot_balance_chf ? parseFloat(r.last_snapshot_balance_chf) : null,
            price_chf_at_31_12: r.last_snapshot_price_chf ? parseFloat(r.last_snapshot_price_chf) : null,
            snapshotted_at: r.last_snapshot_at,
          }
        : null,
    }));

    return res.status(200).json({ wallets });
  } catch (err) {
    console.error("[ppCrypto] GET /wallet error:", (err as Error).message);
    return res.status(500).json({ error: "internal" });
  }
});

// ── DELETE /wallet/:id ────────────────────────────────────────────────────────

ppCryptoRouter.delete("/wallet/:id", async (req, res) => {
  const walletId = req.params.id;
  const tenantId = req.tenantId;

  if (!walletId?.match(/^[0-9a-f-]{36}$/i)) {
    return res.status(400).json({ error: "invalid wallet id" });
  }

  try {
    const { rowCount } = await queryAsTenant(
      tenantId,
      `DELETE FROM pp_crypto_wallets
       WHERE id = $1 AND tenant_id = $2`,
      [walletId, tenantId],
    );

    if (rowCount === 0) {
      return res.status(404).json({ error: "wallet not found" });
    }

    return res.status(204).send();
  } catch (err) {
    console.error("[ppCrypto] DELETE /wallet/:id error:", (err as Error).message);
    return res.status(500).json({ error: "internal" });
  }
});

// ── POST /snapshot/refresh ────────────────────────────────────────────────────

ppCryptoRouter.post("/snapshot/refresh", async (req, res) => {
  const parse = snapshotRefreshSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: "invalid body", details: parse.error.flatten() });
  }

  const { wallet_id, year } = parse.data;
  const tenantId = req.tenantId;
  const targetYear = year ?? new Date().getFullYear() - 1;

  // Vérifier que le wallet appartient bien au tenant
  try {
    const { rows } = await queryAsTenant<{ id: string }>(
      tenantId,
      `SELECT id FROM pp_crypto_wallets WHERE id = $1 AND tenant_id = $2`,
      [wallet_id, tenantId],
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "wallet not found" });
    }

    // Enqueue job BullMQ
    const jobId = await enqueueSingleSnapshot(wallet_id, tenantId, targetYear);

    return res.status(202).json({
      job_id: jobId,
      wallet_id,
      year: targetYear,
      estimated_seconds: 30,
    });
  } catch (err) {
    const message = (err as Error).message;
    if (message.includes("queue not initialized")) {
      // Exécution synchrone si Redis indisponible (mode dégradé)
      console.warn("[ppCrypto] Queue unavailable, falling back to sync snapshot");
      return res.status(503).json({ error: "queue unavailable, retry later" });
    }
    console.error("[ppCrypto] POST /snapshot/refresh error:", message);
    return res.status(500).json({ error: "internal" });
  }
});

// ── GET /snapshot?year=2025 ───────────────────────────────────────────────────

ppCryptoRouter.get("/snapshot", async (req, res) => {
  const parse = snapshotQuerySchema.safeParse(req.query);
  if (!parse.success) {
    return res.status(400).json({ error: "invalid query", details: parse.error.flatten() });
  }

  const { year } = parse.data;
  const tenantId = req.tenantId;

  try {
    const { rows } = await queryAsTenant<{
      wallet_id: string;
      chain: string;
      address: string;
      label: string | null;
      balance_native: string;
      balance_chf: string;
      price_chf_at_31_12: string;
      balance_source: string;
      snapshotted_at: string;
    }>(
      tenantId,
      `SELECT
         s.wallet_id,
         w.chain,
         w.address,
         w.label,
         s.balance_native::text,
         s.balance_chf::text,
         s.price_chf_at_31_12::text,
         s.balance_source,
         s.snapshotted_at
       FROM pp_crypto_snapshots s
       JOIN pp_crypto_wallets w ON w.id = s.wallet_id
       WHERE s.tenant_id = $1 AND s.year = $2
       ORDER BY w.chain, w.address`,
      [tenantId, year],
    );

    const snapshots = rows.map((r) => ({
      wallet_id: r.wallet_id,
      chain: r.chain,
      address: r.address,
      label: r.label,
      balance_native: r.balance_native,
      balance_chf: parseFloat(r.balance_chf),
      price_chf_at_31_12: parseFloat(r.price_chf_at_31_12),
      balance_source: r.balance_source,
      snapshotted_at: r.snapshotted_at,
    }));

    const totalChf = snapshots.reduce((sum, s) => sum + s.balance_chf, 0);

    return res.status(200).json({
      year,
      snapshots,
      total_chf: Math.round(totalChf * 100) / 100,
    });
  } catch (err) {
    console.error("[ppCrypto] GET /snapshot error:", (err as Error).message);
    return res.status(500).json({ error: "internal" });
  }
});
