ALTER TYPE incident_status ADD VALUE IF NOT EXISTS 'agendada';

ALTER TABLE public.incidents
  ADD COLUMN IF NOT EXISTS work_order_description text,
  ADD COLUMN IF NOT EXISTS scheduled_start timestamptz,
  ADD COLUMN IF NOT EXISTS scheduled_end timestamptz;

CREATE INDEX IF NOT EXISTS incidents_scheduled_start_idx
  ON public.incidents (organization_id, scheduled_start)
  WHERE scheduled_start IS NOT NULL;
