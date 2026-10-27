-- §6.1.1 campos comuns: subtipo, aquisição, verificação, autoria e anexos.

alter table public.assets
  add column if not exists subtype text,
  add column if not exists acquired_at date,
  add column if not exists last_verified_at timestamptz,
  add column if not exists created_by text,
  add column if not exists updated_by text;

create table if not exists public.asset_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  asset_external_id text not null,
  kind text not null,
  file_name text not null,
  content_type text not null,
  storage_path text not null,
  size_bytes integer,
  uploaded_by text,
  uploaded_at timestamptz not null default now()
);

create index if not exists asset_attachments_org_asset_idx
  on public.asset_attachments (organization_id, asset_external_id, uploaded_at desc);

alter table public.asset_attachments enable row level security;

drop policy if exists asset_attachments_org_select on public.asset_attachments;
create policy asset_attachments_org_select
  on public.asset_attachments
  for select
  using (organization_id::text = coalesce(current_setting('request.jwt.claims', true)::jsonb->>'organization_id', ''));

insert into storage.buckets (id, name, public, file_size_limit)
values ('asset-attachments', 'asset-attachments', false, 10485760)
on conflict (id) do nothing;

comment on column public.assets.subtype is 'Subtipo da categoria (§6.1.1).';
comment on column public.assets.acquired_at is 'Data de aquisição, quando conhecida.';
comment on column public.assets.last_verified_at is 'Data da última verificação cadastral/operacional.';
comment on table public.asset_attachments is 'Anexos autorizados do ativo: manual, certificado, foto, documento patrimonial.';
