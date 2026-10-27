-- Papéis §5: equipe de manutenção, agente de campo, auditor.
ALTER TYPE public.member_role ADD VALUE IF NOT EXISTS 'maintenance';
ALTER TYPE public.member_role ADD VALUE IF NOT EXISTS 'field';
ALTER TYPE public.member_role ADD VALUE IF NOT EXISTS 'auditor';

ALTER TABLE public.organization_members
  ADD COLUMN IF NOT EXISTS scope_region text,
  ADD COLUMN IF NOT EXISTS scope_org text,
  ADD COLUMN IF NOT EXISTS location_share_until timestamptz;

ALTER TABLE public.organization_groups
  ADD COLUMN IF NOT EXISTS scope_region text,
  ADD COLUMN IF NOT EXISTS scope_org text;

COMMENT ON COLUMN public.organization_members.scope_region IS 'Isolamento §5.7: região operacional autorizada (NULL = cidade inteira).';
COMMENT ON COLUMN public.organization_members.scope_org IS 'Isolamento §5.7: órgão/unidade autorizada.';
COMMENT ON COLUMN public.organization_members.location_share_until IS 'Agente de campo §5.5: compartilha localização só até este instante.';
