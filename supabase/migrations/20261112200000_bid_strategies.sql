-- Copiloto de disputa: estratégia de lance por item (custo, margem mínima, piso e intervalo entre lances).
-- O Nexo não envia lances aos portais; o usuário digita o lance recomendado no portal oficial.

create table if not exists public.bid_strategies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  procurement_item_id uuid not null references public.procurement_items(id) on delete cascade,
  created_by uuid references public.users(id) on delete set null,
  unit_cost numeric(20,4) not null check (unit_cost >= 0),
  min_margin_pct numeric(7,3) not null default 10 check (min_margin_pct >= 0 and min_margin_pct <= 1000),
  opening_bid numeric(20,4) check (opening_bid is null or opening_bid > 0),
  min_decrement numeric(20,4) not null default 0.01 check (min_decrement > 0),
  decrement_type text not null default 'valor' check (decrement_type in ('valor', 'percentual')),
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, procurement_item_id)
);

create index if not exists bid_strategies_tenant_updated_idx on public.bid_strategies (tenant_id, updated_at desc);

alter table public.bid_strategies enable row level security;
revoke all on public.bid_strategies from anon;
grant select, insert, update, delete on public.bid_strategies to authenticated;
grant all on public.bid_strategies to service_role;

drop policy if exists bid_strategies_select_member on public.bid_strategies;
create policy bid_strategies_select_member on public.bid_strategies
  for select to authenticated
  using (public.is_tenant_member(tenant_id));

drop policy if exists bid_strategies_write_team on public.bid_strategies;
create policy bid_strategies_write_team on public.bid_strategies
  for all to authenticated
  using (public.has_tenant_role(tenant_id, array['owner','admin','analyst','sales']::public.user_role[]))
  with check (public.has_tenant_role(tenant_id, array['owner','admin','analyst','sales']::public.user_role[]));
