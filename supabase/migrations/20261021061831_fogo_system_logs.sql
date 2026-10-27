CREATE TABLE IF NOT EXISTS system_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  level text NOT NULL CHECK (level IN ('info', 'warn', 'error')),
  category text NOT NULL CHECK (category IN ('auth', 'http', 'ops', 'system')),
  message text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_system_logs_org_created ON system_logs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_logs_category ON system_logs(organization_id, category);
CREATE INDEX IF NOT EXISTS idx_system_logs_level ON system_logs(organization_id, level);
