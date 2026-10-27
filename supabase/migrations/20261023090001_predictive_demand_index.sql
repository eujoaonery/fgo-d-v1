-- Índice único do horizonte persistido. Fica em migration separada porque
-- o PostgreSQL só permite usar um enum recém-adicionado após o commit.

CREATE UNIQUE INDEX IF NOT EXISTS predictions_demand_period_uidx
  ON public.predictions (
    organization_id,
    prediction_type,
    horizon_hours,
    period_start,
    COALESCE(region, ''),
    COALESCE(input_summary->>'sliceKey', '')
  )
  WHERE prediction_type = 'demand_forecast';
