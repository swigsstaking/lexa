-- Migration 010 : Activation RLS — défense en profondeur multi-tenant
-- Session 35 — 2026-04-16
--
-- Active Row Level Security sur les 4 tables critiques.
-- Les queries applicatives DOIVENT passer par queryAsTenant() (wrapper postgres.ts)
-- qui SET LOCAL app.active_tenant = tenantId dans une transaction.
--
-- Le superuser (owner des tables) bypass RLS naturellement → les scripts seed
-- et migrations continuent à fonctionner sans modification.
--
-- FORCE ROW LEVEL SECURITY n'est PAS activé intentionnellement :
-- cela permettrait aux scripts superuser de continuer à bypasser RLS.
-- Pour bloquer même le superuser → ALTER TABLE ... FORCE ROW LEVEL SECURITY
-- (hors scope V1, à envisager en GA si user DB applicatif séparé).

-- ── taxpayer_drafts ───────────────────────────────────────────────────────────
ALTER TABLE taxpayer_drafts ENABLE ROW LEVEL SECURITY;
-- FORCE : bloque même le owner (lexa_app) — défense en profondeur totale
ALTER TABLE taxpayer_drafts FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_iso_td ON taxpayer_drafts
  FOR ALL
  USING (tenant_id = current_setting('app.active_tenant', true)::uuid);

-- ── company_drafts ────────────────────────────────────────────────────────────
ALTER TABLE company_drafts ENABLE ROW LEVEL SECURITY;
-- FORCE : bloque même le owner (lexa_app) — défense en profondeur totale
ALTER TABLE company_drafts FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_iso_cd ON company_drafts
  FOR ALL
  USING (tenant_id = current_setting('app.active_tenant', true)::uuid);

-- ── events ────────────────────────────────────────────────────────────────────
-- NOTE : owned by postgres sur prod existant. Nécessite superuser pour ALTER.
-- Exécuter 010b_rls_ownership_fix.sql en superuser pour ces 2 tables.
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE events FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_iso_ev ON events
  FOR ALL
  USING (tenant_id = current_setting('app.active_tenant', true)::uuid);

-- ── ai_decisions ──────────────────────────────────────────────────────────────
-- NOTE : owned by postgres sur prod existant. Nécessite superuser pour ALTER.
-- Exécuter 010b_rls_ownership_fix.sql en superuser pour ces 2 tables.
ALTER TABLE ai_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_decisions FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_iso_ad ON ai_decisions
  FOR ALL
  USING (tenant_id = current_setting('app.active_tenant', true)::uuid);

-- ── Vérification ─────────────────────────────────────────────────────────────
SELECT
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE tablename IN ('taxpayer_drafts', 'company_drafts', 'events', 'ai_decisions')
ORDER BY tablename;
