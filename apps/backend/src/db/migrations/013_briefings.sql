-- Migration 013 — Briefings quotidiens conseiller fiscal
-- Session: briefing-quotidien (avril 2026)

CREATE TABLE IF NOT EXISTS briefings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  year INTEGER NOT NULL,
  date_for DATE NOT NULL,  -- le jour du briefing (ex: 2026-04-17)
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  content JSONB NOT NULL,  -- { summary, alerts[], classifications_pending, optimizations[], healthScore }
  markdown TEXT,           -- rendu texte pour display/email
  read_at TIMESTAMPTZ,     -- null si non lu, timestamp sinon
  UNIQUE(tenant_id, date_for)
);

CREATE INDEX IF NOT EXISTS idx_briefings_tenant_date ON briefings (tenant_id, date_for DESC);

-- RLS policy cohérente avec le pattern existant (voir events, companies)
ALTER TABLE briefings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'briefings' AND policyname = 'tenant_iso_briefings'
  ) THEN
    CREATE POLICY tenant_iso_briefings ON briefings
      USING (tenant_id = (current_setting('app.active_tenant', true))::uuid);
  END IF;
END
$$;
