-- Error logs table — captures runtime errors from client and server
-- so we can diagnose issues without relying on browser console.

CREATE TABLE IF NOT EXISTS error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  hospital_id UUID REFERENCES hospitals(id) ON DELETE SET NULL,
  error_type TEXT NOT NULL,
  error_message TEXT,
  error_code TEXT,
  context JSONB,
  user_agent TEXT,
  url TEXT,
  patient_lang TEXT,
  source TEXT NOT NULL DEFAULT 'client' CHECK (source IN ('client', 'server')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_error_logs_created_at ON error_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_session_id ON error_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_error_logs_error_type ON error_logs(error_type);
CREATE INDEX IF NOT EXISTS idx_error_logs_hospital_id ON error_logs(hospital_id);

ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;

-- Service role bypass (used by API routes)
-- Browser/anon clients should NEVER read this table directly.
CREATE POLICY "service_role_only_select" ON error_logs
  FOR SELECT USING (false);
CREATE POLICY "service_role_only_insert" ON error_logs
  FOR INSERT WITH CHECK (false);
