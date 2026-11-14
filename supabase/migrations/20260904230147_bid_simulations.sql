alter table public.procurement_items
  add column if not exists bids_complete boolean not null default false;

create table public.bid_simulations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  procurement_item_id uuid not null references public.procurement_items(id) on delete cascade,
  product_description text not null check (char_length(trim(product_description)) between 2 and 300),
  product_code text,
  offered_unit_value numeric(20,4) not null check (offered_unit_value > 0),
  offered_quantity numeric(20,4),
  analysis_method text not null check (analysis_method in ('exact_bids', 'historical_catalog', 'historical_description', 'insufficient_data')),
  outcome text not null check (outcome in ('would_win', 'tie_first', 'would_rank', 'insufficient_data')),
  projected_rank integer check (projected_rank is null or projected_rank > 0),
  confidence text not null check (confidence in ('confirmed', 'high', 'medium', 'low', 'insufficient')),
  reference_count integer not null default 0 check (reference_count >= 0),
  result_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index bid_simulations_tenant_created_idx on public.bid_simulations (tenant_id, created_at desc);
create index bid_simulations_item_created_idx on public.bid_simulations (procurement_item_id, created_at desc);
create index bids_item_unit_value_idx on public.bids (procurement_item_id, unit_value asc) where unit_value is not null;

alter table public.bid_simulations enable row level security;
revoke all on public.bid_simulations from anon;
grant select, insert on public.bid_simulations to authenticated;

create policy bid_simulations_select_member on public.bid_simulations
  for select to authenticated
  using (public.is_tenant_member(tenant_id));

create policy bid_simulations_insert_owner on public.bid_simulations
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.is_tenant_member(tenant_id)
  );
