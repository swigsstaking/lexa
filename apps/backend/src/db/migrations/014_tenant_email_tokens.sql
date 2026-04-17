-- tenant_id = companies.tenant_id (pas de table 'tenants' dans Lexa V1)
CREATE TABLE IF NOT EXISTS tenant_email_tokens (
  tenant_id UUID PRIMARY KEY,
  token TEXT UNIQUE NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_email_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tenant_email_tokens_token ON tenant_email_tokens(token) WHERE enabled = true;

CREATE TABLE IF NOT EXISTS email_forward_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  from_address TEXT,
  subject TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  attachments_count INT DEFAULT 0,
  attachments_ocr_ids TEXT[] DEFAULT '{}',
  status TEXT NOT NULL CHECK (status IN ('processed', 'ignored', 'error')),
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_email_forward_history_tenant_date ON email_forward_history(tenant_id, received_at DESC);

-- RLS
ALTER TABLE tenant_email_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_iso_emails ON tenant_email_tokens;
CREATE POLICY tenant_iso_emails ON tenant_email_tokens USING (tenant_id = (current_setting('app.active_tenant', true))::uuid);

ALTER TABLE email_forward_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_iso_emails_history ON email_forward_history;
CREATE POLICY tenant_iso_emails_history ON email_forward_history USING (tenant_id = (current_setting('app.active_tenant', true))::uuid);

INSERT INTO schema_migrations (version) VALUES ('014_tenant_email_tokens') ON CONFLICT (version) DO NOTHING;
