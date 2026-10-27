alter table public.system_settings
  add column if not exists crisis jsonb not null default '{}'::jsonb;

comment on column public.system_settings.crisis is 'Estado de crise operacional A/B/C e plano de ação do CCO.';
