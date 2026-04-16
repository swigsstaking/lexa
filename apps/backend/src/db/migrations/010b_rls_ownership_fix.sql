-- Migration 010b : Fix ownership + activation RLS tables events + ai_decisions
-- Session 35 — 2026-04-16
--
-- À EXÉCUTER EN SUPERUSER (postgres) car events et ai_decisions ont été créées
-- par le user postgres lors du setup initial.
--
-- Usage :
--   sudo -u postgres psql lexa -f 010b_rls_ownership_fix.sql
-- OU depuis le serveur si pg_hba.conf permet trust/ident pour postgres :
--   psql -U postgres lexa -f 010b_rls_ownership_fix.sql

-- 1. Transférer l'ownership à lexa_app pour que migrate.ts puisse gérer ces tables
ALTER TABLE events OWNER TO lexa_app;
ALTER TABLE ai_decisions OWNER TO lexa_app;

-- 2. Activer RLS sur events
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE events FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_iso_ev ON events
  FOR ALL
  USING (tenant_id = current_setting('app.active_tenant', true)::uuid);

-- 3. Activer RLS sur ai_decisions
ALTER TABLE ai_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_decisions FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_iso_ad ON ai_decisions
  FOR ALL
  USING (tenant_id = current_setting('app.active_tenant', true)::uuid);

-- 4. Vérification finale
SELECT
  tablename,
  tableowner,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE tablename IN ('taxpayer_drafts', 'company_drafts', 'events', 'ai_decisions')
ORDER BY tablename;
