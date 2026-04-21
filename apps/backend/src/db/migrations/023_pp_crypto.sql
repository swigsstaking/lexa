-- Migration 023 — PP crypto wallets + snapshots annuels
-- Tables pour le module crypto du wizard fiscal PP.
-- RLS obligatoire : toutes les requêtes passent par queryAsTenant().

-- pp_crypto_wallets : adresses wallet enregistrées par tenant/user
CREATE TABLE IF NOT EXISTS pp_crypto_wallets (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL,
  chain      TEXT NOT NULL CHECK (chain IN ('eth', 'btc', 'sol')),
  address    TEXT NOT NULL,
  label      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, chain, address)
);

CREATE INDEX IF NOT EXISTS idx_pp_crypto_wallets_tenant
  ON pp_crypto_wallets (tenant_id);

ALTER TABLE pp_crypto_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE pp_crypto_wallets FORCE ROW LEVEL SECURITY;

CREATE POLICY pp_crypto_wallets_tenant_isolation ON pp_crypto_wallets
  FOR ALL
  USING (tenant_id = current_setting('app.active_tenant', true)::uuid);


-- pp_crypto_snapshots : snapshot annuel au 31.12 pour chaque wallet
CREATE TABLE IF NOT EXISTS pp_crypto_snapshots (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  wallet_id            UUID NOT NULL REFERENCES pp_crypto_wallets(id) ON DELETE CASCADE,
  year                 INT NOT NULL,
  balance_native       NUMERIC(38, 18) NOT NULL,
  balance_chf          NUMERIC(20, 2) NOT NULL,
  price_chf_at_31_12   NUMERIC(20, 8) NOT NULL,
  price_source         TEXT NOT NULL DEFAULT 'coinmarketcap',
  balance_source       TEXT NOT NULL CHECK (balance_source IN ('etherscan', 'blockstream', 'solana_rpc')),
  snapshotted_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (wallet_id, year)
);

CREATE INDEX IF NOT EXISTS idx_pp_crypto_snapshots_tenant_year
  ON pp_crypto_snapshots (tenant_id, year);

CREATE INDEX IF NOT EXISTS idx_pp_crypto_snapshots_wallet
  ON pp_crypto_snapshots (wallet_id);

ALTER TABLE pp_crypto_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE pp_crypto_snapshots FORCE ROW LEVEL SECURITY;

CREATE POLICY pp_crypto_snapshots_tenant_isolation ON pp_crypto_snapshots
  FOR ALL
  USING (tenant_id = current_setting('app.active_tenant', true)::uuid);


-- Smoke test RLS (commenté — superuser bypass RLS automatiquement)
-- Pour tester manuellement :
--   SET app.active_tenant = '<tenant_id>';
--   SELECT * FROM pp_crypto_wallets;   -- doit retourner seulement les wallets du tenant
--   SELECT * FROM pp_crypto_snapshots; -- idem

INSERT INTO schema_migrations (version) VALUES ('023_pp_crypto')
  ON CONFLICT (version) DO NOTHING;
