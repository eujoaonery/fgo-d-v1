-- OS §6.4: estados, diagnóstico, materiais, evidências de fechamento
-- Agentes §6.3: pessoa (matrícula, órgão, habilitações, situação funcional, escala)
-- Ativo: plano de manutenção (aviso de vencimento sem alterar cadastral)

ALTER TYPE incident_status ADD VALUE IF NOT EXISTS 'triagem';
ALTER TYPE incident_status ADD VALUE IF NOT EXISTS 'planejada';
ALTER TYPE incident_status ADD VALUE IF NOT EXISTS 'em deslocamento';
ALTER TYPE incident_status ADD VALUE IF NOT EXISTS 'aguardando material';

ALTER TABLE public.incidents
  ADD COLUMN IF NOT EXISTS diagnosis text,
  ADD COLUMN IF NOT EXISTS materials text,
  ADD COLUMN IF NOT EXISTS close_problem text,
  ADD COLUMN IF NOT EXISTS close_solution text,
  ADD COLUMN IF NOT EXISTS close_signature text,
  ADD COLUMN IF NOT EXISTS close_images jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS registration_number text,
  ADD COLUMN IF NOT EXISTS responsible_org text,
  ADD COLUMN IF NOT EXISTS unit text,
  ADD COLUMN IF NOT EXISTS job_title text,
  ADD COLUMN IF NOT EXISTS qualifications jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS functional_status text NOT NULL DEFAULT 'ativo',
  ADD COLUMN IF NOT EXISTS shifts jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS location_share_until timestamptz;

ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS maintenance_interval_days integer,
  ADD COLUMN IF NOT EXISTS maintenance_next_due date,
  ADD COLUMN IF NOT EXISTS maintenance_last_done date,
  ADD COLUMN IF NOT EXISTS maintenance_plan_notes text;
