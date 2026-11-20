-- Mercado por município: mapa de calor do estado, filtro por município e evolução mensal da cidade.
-- Valores acima de R$ 5 bilhões por processo/item são descartados (erros de digitação nos portais distorcem o mapa).
-- Valor = homologado quando existe, senão o estimado da licitação (resultado homologado cobre só parte dos processos).

drop materialized view if exists public.market_city_month;
create materialized view public.market_city_month as
select
  p.city_ibge_code,
  c.state_code,
  date_trunc('month', p.published_at)::date as period_start,
  count(*)::bigint as procurement_count,
  coalesce(sum(i.n), 0)::bigint as item_count,
  count(distinct p.organization_id)::bigint as organization_count,
  coalesce(sum((case when coalesce(nullif(p.homologated_value, 0), p.estimated_value) < 5000000000 then coalesce(nullif(p.homologated_value, 0), p.estimated_value) end)), 0)::numeric(24,4) as total_value,
  now() as refreshed_at
from public.procurements p
join public.cities c on c.ibge_code = p.city_ibge_code
left join (select procurement_id, count(*) as n from public.procurement_items group by 1) i on i.procurement_id = p.id
where p.published_at is not null
group by 1, 2, 3
with no data;

create unique index market_city_month_idx on public.market_city_month (city_ibge_code, period_start);
create index market_city_month_state_idx on public.market_city_month (state_code, period_start);
grant select on public.market_city_month to authenticated;

create or replace function public.refresh_market_analytics()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  refresh materialized view public.market_summary;
  refresh materialized view public.company_performance;
  refresh materialized view public.product_market_summary;
  refresh materialized view public.organization_purchase_summary;
  refresh materialized view public.market_city_month;
end;
$$;
revoke all on function public.refresh_market_analytics() from public, anon, authenticated;
grant execute on function public.refresh_market_analytics() to service_role;

-- Rankings de um município: órgãos, vencedores e produtos no período
create or replace function public.city_market_rankings(p_city_ibge text, p_from date default (current_date - interval '1 year')::date)
returns table (kind text, label text, ref_id uuid, value numeric, count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  (select 'organization'::text, p.agency_name, null::uuid,
          coalesce(sum((case when coalesce(nullif(p.homologated_value, 0), p.estimated_value) < 5000000000 then coalesce(nullif(p.homologated_value, 0), p.estimated_value) end)), 0)::numeric, count(*)::bigint
   from public.procurements p
   where p.city_ibge_code = p_city_ibge and p.published_at >= p_from and p.agency_name is not null
   group by p.agency_name order by 4 desc limit 5)
  union all
  (select 'supplier'::text, s.legal_name, s.id, coalesce(sum(case when r.total_value < 5000000000 then r.total_value end), 0)::numeric, count(distinct r.id)::bigint
   from public.procurements p
   join public.procurement_items pi on pi.procurement_id = p.id
   join public.results r on r.procurement_item_id = pi.id and r.winner
   join public.suppliers s on s.id = r.supplier_id
   where p.city_ibge_code = p_city_ibge and p.published_at >= p_from
   group by s.id, s.legal_name order by 4 desc limit 5)
  union all
  (select 'product'::text, g.name, g.id, coalesce(sum(case when pi.estimated_total_value < 5000000000 then pi.estimated_total_value end), 0)::numeric, count(distinct pi.procurement_id)::bigint
   from public.procurements p
   join public.procurement_items pi on pi.procurement_id = p.id
   join public.product_groups g on g.id = pi.group_id
   where p.city_ibge_code = p_city_ibge and p.published_at >= p_from
   group by g.id, g.name order by 4 desc limit 5);
$$;
grant execute on function public.city_market_rankings(text, date) to authenticated;

-- Primeira carga
refresh materialized view public.market_city_month;
