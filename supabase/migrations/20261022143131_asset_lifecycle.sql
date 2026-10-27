-- Vida útil, degradação e ciclo de preventiva do ativo (equipamento e veículo).
-- Campos opcionais: ativos já cadastrados sem esses dados permanecem nulos.

ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS useful_life_months integer,
  ADD COLUMN IF NOT EXISTS degradation_level text;

ALTER TABLE public.assets
  DROP CONSTRAINT IF EXISTS assets_degradation_level_chk;

ALTER TABLE public.assets
  ADD CONSTRAINT assets_degradation_level_chk
  CHECK (
    degradation_level IS NULL
    OR degradation_level IN ('nenhuma', 'baixa', 'media', 'alta', 'critica')
  );

ALTER TABLE public.assets
  DROP CONSTRAINT IF EXISTS assets_useful_life_months_chk;

ALTER TABLE public.assets
  ADD CONSTRAINT assets_useful_life_months_chk
  CHECK (useful_life_months IS NULL OR useful_life_months > 0);

COMMENT ON COLUMN public.assets.useful_life_months IS
  'Vida útil nominal em meses a partir da instalação ou aquisição. Nulo se ainda não cadastrada.';
COMMENT ON COLUMN public.assets.degradation_level IS
  'Nível informado (nenhuma, baixa, media, alta, critica). Nulo = estimar pelo atraso da preventiva e pela vida útil.';
COMMENT ON COLUMN public.assets.maintenance_interval_days IS
  'Ciclo de manutenção/revisão preventiva em dias (ex.: 30, 60, 90).';
