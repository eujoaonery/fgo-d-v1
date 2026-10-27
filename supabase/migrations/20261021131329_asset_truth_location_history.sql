-- §4.2–4.4: procedência, localização estruturada e histórico de cadastro.

alter table public.assets
  add column if not exists location jsonb,
  add column if not exists data_origin text not null default 'manual';

alter table public.telemetry_events
  add column if not exists received_at timestamptz,
  add column if not exists quality text,
  add column if not exists data_origin text;

update public.telemetry_events
set received_at = coalesce(received_at, created_at)
where received_at is null;

update public.assets
set connectivity_status = case connectivity_status
  when 'online' then 'conectado'
  when 'degradado' then 'atrasado'
  when 'offline' then 'sem_comunicacao'
  else connectivity_status
end
where connectivity_status in ('online', 'degradado', 'offline');

update public.assets
set cadastral_status = case cadastral_status
  when 'ativo' then 'operacional'
  when 'em_instalacao' then 'nao_instalado'
  else cadastral_status
end
where cadastral_status in ('ativo', 'em_instalacao');

create table if not exists public.asset_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  asset_external_id text not null,
  actor_label text,
  action text not null,
  before_state jsonb,
  after_state jsonb,
  changed_fields text[],
  changed_at timestamptz not null default now()
);

create index if not exists asset_history_org_asset_idx
  on public.asset_history (organization_id, asset_external_id, changed_at desc);

alter table public.asset_history enable row level security;

drop policy if exists asset_history_org_select on public.asset_history;
create policy asset_history_org_select
  on public.asset_history
  for select
  using (organization_id::text = coalesce(current_setting('request.jwt.claims', true)::jsonb->>'organization_id', ''));

comment on table public.asset_history is 'Histórico de alterações cadastrais do ativo (§4.3). Eventos operacionais permanecem em telemetry_events/alerts.';
comment on column public.assets.location is 'Endereço estruturado (CEP, bairro, cidade, UF, logradouro, número).';
comment on column public.assets.data_origin is 'manual | importado | simulado | real | integracao';
