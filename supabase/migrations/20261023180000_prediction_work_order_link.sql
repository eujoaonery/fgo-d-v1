ALTER TABLE public.predictions
  ADD COLUMN IF NOT EXISTS work_order_protocol text;

ALTER TABLE public.incidents
  ADD COLUMN IF NOT EXISTS source_prediction_id text;

CREATE INDEX IF NOT EXISTS incidents_source_prediction_idx
  ON public.incidents (organization_id, source_prediction_id)
  WHERE source_prediction_id IS NOT NULL;

COMMENT ON COLUMN public.predictions.work_order_protocol IS
  'Última ordem de serviço vinculada. A previsão permanece independente de alertas e ocorrências.';
COMMENT ON COLUMN public.incidents.source_prediction_id IS
  'external_id da previsão de origem. Não converte nem exclui a previsão.';
