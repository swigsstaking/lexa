-- Lexa — Event store schema (session 06)
-- Pattern: Postgres as event store, immutable append-only log

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Main event table
CREATE TABLE IF NOT EXISTS events (
  id            BIGSERIAL PRIMARY KEY,
  tenant_id     UUID NOT NULL,
  stream_id     UUID NOT NULL,
  sequence      BIGINT NOT NULL,
  type          TEXT NOT NULL,
  payload       JSONB NOT NULL,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recorded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT events_stream_seq_unique UNIQUE (tenant_id, stream_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_events_tenant_stream ON events (tenant_id, stream_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events (type);
CREATE INDEX IF NOT EXISTS idx_events_occurred ON events (occurred_at);
CREATE INDEX IF NOT EXISTS idx_events_payload_gin ON events USING GIN (payload);

-- AI decision trace table (linked to events)
CREATE TABLE IF NOT EXISTS ai_decisions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id      BIGINT REFERENCES events(id) ON DELETE CASCADE,
  tenant_id     UUID NOT NULL,
  agent         TEXT NOT NULL,
  model         TEXT NOT NULL,
  confidence    NUMERIC(5,4) NOT NULL,
  reasoning     TEXT,
  citations     JSONB NOT NULL DEFAULT '[]'::jsonb,
  alternatives  JSONB NOT NULL DEFAULT '[]'::jsonb,
  rag_context   JSONB NOT NULL DEFAULT '[]'::jsonb,
  duration_ms   INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_decisions_event ON ai_decisions (event_id);
CREATE INDEX IF NOT EXISTS idx_ai_decisions_tenant_agent ON ai_decisions (tenant_id, agent);
CREATE INDEX IF NOT EXISTS idx_ai_decisions_confidence ON ai_decisions (confidence);

-- Migration tracking
CREATE TABLE IF NOT EXISTS schema_migrations (
  version     TEXT PRIMARY KEY,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO schema_migrations (version) VALUES ('001_events')
  ON CONFLICT (version) DO NOTHING;
