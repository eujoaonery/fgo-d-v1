alter table public.alerts
  add column if not exists claimed_by text,
  add column if not exists claimed_by_label text,
  add column if not exists claimed_at timestamptz,
  add column if not exists dispatched_at timestamptz,
  add column if not exists completed_at timestamptz;

create index if not exists alerts_claimed_by_open_idx
  on public.alerts (organization_id, claimed_by)
  where claimed_by is not null;
