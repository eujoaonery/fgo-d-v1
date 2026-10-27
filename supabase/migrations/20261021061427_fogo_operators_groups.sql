CREATE TABLE IF NOT EXISTS organization_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

ALTER TABLE organization_members
  ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES organization_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_organization_groups_org ON organization_groups(organization_id);
CREATE INDEX IF NOT EXISTS idx_organization_members_group ON organization_members(group_id);
