-- Produto x concorrente x preço: a análise inteira ligada.
-- Tudo calculado ao vivo a partir de results (vencedores) -> itens -> produto agrupado (product_groups).
-- Estatísticas de preço usam só a unidade mais frequente do produto (UN, CX, KG...), para não misturar unidades.

-- Quem vence neste produto
create or replace function public.product_group_suppliers(
  p_group_id uuid, p_state text default null, p_days integer default 365, p_limit integer default 10
)
returns table (
  supplier_id uuid, supplier_name text, supplier_state char(2), wins bigint, median_unit_value numeric,
  min_unit_value numeric, last_unit_value numeric, last_win_at timestamptz, states text[]
)
language sql
stable
security invoker
set search_path = ''
as $$
  with g as (select unit from public.product_groups where id = p_group_id),
  w as (
    select r.supplier_id, r.unit_value, p.published_at, p.state_code
    from public.results r
    join public.procurement_items i on i.id = r.procurement_item_id
    join public.procurements p on p.id = i.procurement_id
    cross join g
    where i.group_id = p_group_id and r.winner and r.unit_value > 0 and r.supplier_id is not null
      and (g.unit is null or public.normalize_unit(i.unit) is not distinct from g.unit)
      and p.published_at >= now() - make_interval(days => least(greatest(coalesce(p_days, 365), 1), 1100))
      and (nullif(trim(p_state), '') is null or p.state_code = upper(trim(p_state)))
  )
  select w.supplier_id, s.legal_name, s.state_code, count(*),
         (percentile_cont(0.5) within group (order by w.unit_value))::numeric,
         min(w.unit_value),
         (array_agg(w.unit_value order by w.published_at desc nulls last))[1],
         max(w.published_at),
         array(select x.state_code::text from (select distinct w2.state_code from w w2 where w2.supplier_id = w.supplier_id and w2.state_code is not null) x limit 6)
  from w join public.suppliers s on s.id = w.supplier_id
  group by w.supplier_id, s.legal_name, s.state_code
  order by count(*) desc, min(w.unit_value)
  limit greatest(1, least(coalesce(p_limit, 10), 50))
$$;

-- Valores pelos quais o produto foi vencido, do mais recente para o mais antigo
create or replace function public.product_group_winning_prices(
  p_group_id uuid, p_state text default null, p_days integer default 365, p_limit integer default 30, p_offset integer default 0
)
returns table (
  result_id uuid, supplier_id uuid, supplier_name text, unit_value numeric, quantity numeric, unit text, won_at timestamptz,
  state_code char(2), city_name text, procurement_id uuid, control_number text, source_url text, source_portal_name text,
  item_description text, total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select r.id, r.supplier_id, s.legal_name, r.unit_value, coalesce(r.quantity_homologated, i.quantity), i.unit, p.published_at,
         p.state_code, p.city_name, p.id, p.control_number, p.source_url, p.source_portal_name, left(i.original_description, 160),
         count(*) over()
  from public.results r
  join public.procurement_items i on i.id = r.procurement_item_id
  join public.procurements p on p.id = i.procurement_id
  left join public.suppliers s on s.id = r.supplier_id
  cross join (select unit from public.product_groups where id = p_group_id) g
  where i.group_id = p_group_id and r.winner and r.unit_value > 0
    and (g.unit is null or public.normalize_unit(i.unit) is not distinct from g.unit)
    and p.published_at >= now() - make_interval(days => least(greatest(coalesce(p_days, 365), 1), 1100))
    and (nullif(trim(p_state), '') is null or p.state_code = upper(trim(p_state)))
  order by p.published_at desc nulls last, r.unit_value
  limit greatest(1, least(coalesce(p_limit, 30), 100))
  offset greatest(coalesce(p_offset, 0), 0)
$$;

-- Em que posição o meu valor ficaria entre os vencedores recentes
create or replace function public.product_price_position(
  p_group_id uuid, p_offered numeric, p_state text default null, p_days integer default 365
)
returns table (
  sample_size integer, lower_count integer, projected_rank integer, percentile numeric,
  min_value numeric, p25_value numeric, median_value numeric, p75_value numeric, max_value numeric,
  best_supplier_id uuid, best_supplier_name text, difference_to_best_pct numeric, difference_to_median_pct numeric, unit text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with g as (select unit from public.product_groups where id = p_group_id),
  w as (
    select r.unit_value, r.supplier_id
    from public.results r
    join public.procurement_items i on i.id = r.procurement_item_id
    join public.procurements p on p.id = i.procurement_id
    cross join g
    where i.group_id = p_group_id and r.winner and r.unit_value > 0
      and (g.unit is null or public.normalize_unit(i.unit) is not distinct from g.unit)
      and p.published_at >= now() - make_interval(days => least(greatest(coalesce(p_days, 365), 1), 1100))
      and (nullif(trim(p_state), '') is null or p.state_code = upper(trim(p_state)))
  ), stats as (
    select count(*)::int as n,
           count(*) filter (where unit_value < p_offered)::int as lower_n,
           min(unit_value) as mn, (percentile_cont(0.25) within group (order by unit_value))::numeric as q1,
           (percentile_cont(0.5) within group (order by unit_value))::numeric as med,
           (percentile_cont(0.75) within group (order by unit_value))::numeric as q3, max(unit_value) as mx
    from w
  ), best as (
    select w.supplier_id, s.legal_name from w left join public.suppliers s on s.id = w.supplier_id order by w.unit_value limit 1
  )
  select st.n, st.lower_n, st.lower_n + 1,
         case when st.n = 0 then null else round(100.0 * st.lower_n / st.n, 1) end,
         st.mn, st.q1, st.med, st.q3, st.mx, b.supplier_id, b.legal_name,
         case when st.mn is null or st.mn = 0 then null else round(100.0 * (p_offered - st.mn) / st.mn, 1) end,
         case when st.med is null or st.med = 0 then null else round(100.0 * (p_offered - st.med) / st.med, 1) end,
         (select unit from g)
  from stats st left join best b on true
$$;

-- Comparação com os OUTROS clientes do sistema, anônima: só agregados e só com pelo menos 3 outras empresas.
-- (SECURITY DEFINER para enxergar as simulações de outras empresas; nenhum dado individual sai daqui.)
create or replace function public.product_clients_position(p_group_id uuid, p_offered numeric, p_days integer default 365)
returns table (companies integer, simulations integer, min_value numeric, median_value numeric, max_value numeric, lower_count integer, percentile numeric)
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (select public.current_tenant_id() as tid),
  sims as (
    select b.tenant_id, b.offered_unit_value as v
    from public.bid_simulations b
    join public.procurement_items i on i.id = b.procurement_item_id
    where i.group_id = p_group_id and b.offered_unit_value > 0
      and b.created_at >= now() - make_interval(days => least(greatest(coalesce(p_days, 365), 1), 1100))
      and b.tenant_id is distinct from (select tid from mine)
  ), agg as (
    select count(distinct tenant_id)::int as companies, count(*)::int as n, min(v) as mn,
           (percentile_cont(0.5) within group (order by v))::numeric as med, max(v) as mx,
           count(*) filter (where v < p_offered)::int as lower_n
    from sims
  )
  select a.companies, a.n, a.mn, a.med, a.mx, a.lower_n, round(100.0 * a.lower_n / nullif(a.n, 0), 1)
  from agg a
  where a.companies >= 3 and (select tid from mine) is not null
$$;

-- Concorrente -> produtos em que ele vence (com o preço dele frente ao mercado)
create or replace function public.supplier_product_groups(p_supplier_id uuid, p_days integer default 365, p_limit integer default 20)
returns table (group_id uuid, name text, niche text, unit text, wins bigint, median_unit_value numeric, last_win_at timestamptz, market_median numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  select g.id, g.name, g.niche, g.unit, count(*), (percentile_cont(0.5) within group (order by r.unit_value))::numeric, max(p.published_at), g.median_unit_value
  from public.results r
  join public.procurement_items i on i.id = r.procurement_item_id
  join public.product_groups g on g.id = i.group_id
  join public.procurements p on p.id = i.procurement_id
  where r.supplier_id = p_supplier_id and r.winner and r.unit_value > 0
    and (g.unit is null or public.normalize_unit(i.unit) is not distinct from g.unit)
    and p.published_at >= now() - make_interval(days => least(greatest(coalesce(p_days, 365), 1), 1100))
  group by g.id, g.name, g.niche, g.unit, g.median_unit_value
  order by count(*) desc, max(p.published_at) desc
  limit greatest(1, least(coalesce(p_limit, 20), 100))
$$;

-- Dados de um produto agrupado (cabeçalho da página do produto)
create or replace function public.get_product_group(p_group_id uuid)
returns table (
  id uuid, name text, niche text, kind text, catalog_group text, catalog_class text, item_count integer, procurement_count integer,
  description_variants integer, unit text, min_unit_value numeric, median_unit_value numeric, max_unit_value numeric, last_seen_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select g.id, g.name, g.niche, g.kind, g.catalog_group, g.catalog_class, g.item_count, g.procurement_count, g.description_variants,
         g.unit, g.min_unit_value, g.median_unit_value, g.max_unit_value, g.last_seen_at
  from public.product_groups g where g.id = p_group_id
$$;

revoke all on function public.product_group_suppliers(uuid, text, integer, integer) from public, anon;
revoke all on function public.product_group_winning_prices(uuid, text, integer, integer, integer) from public, anon;
revoke all on function public.product_price_position(uuid, numeric, text, integer) from public, anon;
revoke all on function public.product_clients_position(uuid, numeric, integer) from public, anon;
revoke all on function public.supplier_product_groups(uuid, integer, integer) from public, anon;
revoke all on function public.get_product_group(uuid) from public, anon;
grant execute on function public.product_group_suppliers(uuid, text, integer, integer) to authenticated;
grant execute on function public.product_group_winning_prices(uuid, text, integer, integer, integer) to authenticated;
grant execute on function public.product_price_position(uuid, numeric, text, integer) to authenticated;
grant execute on function public.product_clients_position(uuid, numeric, integer) to authenticated;
grant execute on function public.supplier_product_groups(uuid, integer, integer) to authenticated;
grant execute on function public.get_product_group(uuid) to authenticated;
