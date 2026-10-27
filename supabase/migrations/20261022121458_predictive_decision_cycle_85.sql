-- Ciclo aceitar / rejeitar / adiar / irrelevante da recomendação preditiva (§8.5).
-- review_status continua sendo o resultado observado da previsão (§8.4).

ALTER TABLE public.predictions
  ADD COLUMN IF NOT EXISTS decision_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS decision_justification text,
  ADD COLUMN IF NOT EXISTS decision_at timestamptz,
  ADD COLUMN IF NOT EXISTS decision_by text,
  ADD COLUMN IF NOT EXISTS observed_note text;

ALTER TABLE public.predictions
  DROP CONSTRAINT IF EXISTS predictions_decision_status_check;

ALTER TABLE public.predictions
  ADD CONSTRAINT predictions_decision_status_check
  CHECK (decision_status IN ('pending', 'accepted', 'rejected', 'deferred', 'irrelevant'));
