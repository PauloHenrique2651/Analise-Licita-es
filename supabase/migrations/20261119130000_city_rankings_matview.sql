-- Rankings por município pré-calculados: a consulta ao vivo levava mais de 2 minutos para a capital de São Paulo.
-- Janela de 12 meses a partir da última atualização. Mesmo corte de R$ 5 bilhões por valor usado em market_city_month.

drop materialized view if exists public.market_city_ranking;
create materialized view public.market_city_ranking as
with org as (
  select p.city_ibge_code, 'organization'::text as kind, p.agency_name as label, null::uuid as ref_id,
         coalesce(sum(case when coalesce(nullif(p.homologated_value, 0), p.estimated_value) < 5000000000 then coalesce(nullif(p.homologated_value, 0), p.estimated_value) end), 0)::numeric as value,
         count(*)::bigint as count
  from public.procurements p
  where p.city_ibge_code is not null and p.published_at >= now() - interval '1 year' and p.agency_name is not null
  group by 1, 3
), sup as (
  select p.city_ibge_code, 'supplier'::text, s.legal_name, s.id,
         coalesce(sum(case when r.total_value < 5000000000 then r.total_value end), 0)::numeric, count(distinct r.id)::bigint
  from public.procurements p
  join public.procurement_items pi on pi.procurement_id = p.id
  join public.results r on r.procurement_item_id = pi.id and r.winner
  join public.suppliers s on s.id = r.supplier_id
  where p.city_ibge_code is not null and p.published_at >= now() - interval '1 year'
  group by 1, s.id, s.legal_name
), prod as (
  select p.city_ibge_code, 'product'::text, g.name, g.id,
         coalesce(sum(case when pi.estimated_total_value < 5000000000 then pi.estimated_total_value end), 0)::numeric, count(distinct pi.procurement_id)::bigint
  from public.procurements p
  join public.procurement_items pi on pi.procurement_id = p.id
  join public.product_groups g on g.id = pi.group_id
  where p.city_ibge_code is not null and p.published_at >= now() - interval '1 year'
  group by 1, g.id, g.name
), unioned as (
  select * from org union all select * from sup union all select * from prod
), ranked as (
  select u.*, row_number() over (partition by city_ibge_code, kind order by value desc, label) as rank from unioned u
)
select city_ibge_code, kind, rank::integer, label, ref_id, value, count from ranked where rank <= 5
with no data;

create unique index market_city_ranking_idx on public.market_city_ranking (city_ibge_code, kind, rank);
grant select on public.market_city_ranking to authenticated;

create or replace function public.city_market_rankings(p_city_ibge text, p_from date default null)
returns table (kind text, label text, ref_id uuid, value numeric, count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select r.kind, r.label, r.ref_id, r.value, r.count
  from public.market_city_ranking r
  where r.city_ibge_code = p_city_ibge
  order by r.kind, r.rank;
$$;

create or replace function public.refresh_market_analytics()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not pg_try_advisory_xact_lock(727001) then return; end if;
  if (select max(refreshed_at) from public.market_summary) > now() - interval '60 minutes' then return; end if;
  refresh materialized view concurrently public.market_summary;
  refresh materialized view concurrently public.market_city_month;
  refresh materialized view concurrently public.market_city_ranking;
  refresh materialized view public.company_performance;
  refresh materialized view public.product_market_summary;
  refresh materialized view public.organization_purchase_summary;
end;
$$;
revoke all on function public.refresh_market_analytics() from public, anon, authenticated;
grant execute on function public.refresh_market_analytics() to service_role;

refresh materialized view public.market_city_ranking;
