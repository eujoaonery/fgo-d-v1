-- Características próprias do tipo: câmera e radar.

alter table public.assets
  add column if not exists specs jsonb;

comment on column public.assets.specs is
  'Câmera: visão noturna, resolução e imagem. Radar: velocidade máxima em km/h.';
