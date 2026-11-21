-- Cobertura do PNCP: por dia e modalidade, o total oficial e o nosso, gravado pela rotina de conferência.
create table if not exists public.pncp_coverage (
  day date not null,
  modality integer not null,
  pncp_total integer not null,
  our_total integer not null,
  checked_at timestamptz not null default now(),
  primary key (day, modality)
);
create index if not exists pncp_coverage_day_idx on public.pncp_coverage (day desc);
alter table public.pncp_coverage enable row level security;
drop policy if exists pncp_coverage_read on public.pncp_coverage;
create policy pncp_coverage_read on public.pncp_coverage for select to authenticated using (true);
grant select on public.pncp_coverage to authenticated;
grant all on public.pncp_coverage to service_role;
