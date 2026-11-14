create materialized view public.market_summary as
select
  date_trunc('month', coalesce(p.published_at, pi.imported_at))::date as period_start,
  o.state_code,
  count(distinct p.id)::bigint as procurement_count,
  count(distinct pi.id)::bigint as item_count,
  count(distinct r.supplier_id)::bigint as supplier_count,
  count(distinct p.organization_id)::bigint as organization_count,
  count(*)::bigint as record_count,
  coalesce(sum(case when r.winner then r.total_value else 0 end), 0)::numeric(24,4) as total_value,
  coalesce(avg(case when r.winner then r.unit_value end), 0)::numeric(24,4) as average_winner_price,
  coalesce(sum(case when r.winner then r.total_value else 0 end) / nullif(count(distinct p.id), 0), 0)::numeric(24,4) as average_ticket,
  now() as refreshed_at
from public.procurements p
join public.organizations o on o.id = p.organization_id
join public.procurement_items pi on pi.procurement_id = p.id
left join public.results r on r.procurement_item_id = pi.id
group by 1, 2
with no data;

create unique index market_summary_period_state_idx on public.market_summary (period_start, state_code);

create materialized view public.company_performance as
select
  r.supplier_id,
  s.legal_name,
  o.state_code,
  date_trunc('month', coalesce(p.published_at, r.imported_at))::date as period_start,
  count(*) filter (where r.winner)::bigint as wins,
  count(distinct pi.id)::bigint as item_count,
  count(distinct p.organization_id)::bigint as organization_count,
  coalesce(sum(r.total_value) filter (where r.winner), 0)::numeric(24,4) as won_value,
  coalesce(avg(r.unit_value) filter (where r.winner), 0)::numeric(24,4) as average_price,
  now() as refreshed_at
from public.results r
join public.suppliers s on s.id = r.supplier_id
join public.procurement_items pi on pi.id = r.procurement_item_id
join public.procurements p on p.id = pi.procurement_id
join public.organizations o on o.id = p.organization_id
group by 1, 2, 3, 4
with no data;

create index company_performance_supplier_idx on public.company_performance (supplier_id, period_start desc);
create index company_performance_value_idx on public.company_performance (won_value desc);

create materialized view public.product_market_summary as
select
  pi.product_id,
  pr.grouped_name,
  o.state_code,
  date_trunc('month', coalesce(p.published_at, pi.imported_at))::date as period_start,
  count(distinct p.id)::bigint as procurement_count,
  count(pi.id)::bigint as item_count,
  coalesce(sum(pi.quantity), 0)::numeric(24,4) as total_quantity,
  coalesce(sum(r.total_value) filter (where r.winner), 0)::numeric(24,4) as total_value,
  coalesce(avg(r.unit_value) filter (where r.winner), 0)::numeric(24,4) as average_winner_price,
  percentile_cont(0.5) within group (order by r.unit_value) filter (where r.winner) as median_winner_price,
  now() as refreshed_at
from public.procurement_items pi
join public.procurements p on p.id = pi.procurement_id
join public.organizations o on o.id = p.organization_id
left join public.products pr on pr.id = pi.product_id
left join public.results r on r.procurement_item_id = pi.id
group by 1, 2, 3, 4
with no data;

create index product_market_summary_product_idx on public.product_market_summary (product_id, period_start desc);

create materialized view public.organization_purchase_summary as
select
  p.organization_id,
  o.legal_name,
  o.state_code,
  date_trunc('month', coalesce(p.published_at, p.imported_at))::date as period_start,
  count(distinct p.id)::bigint as procurement_count,
  count(pi.id)::bigint as item_count,
  count(distinct r.supplier_id) filter (where r.winner)::bigint as winner_count,
  coalesce(sum(r.total_value) filter (where r.winner), 0)::numeric(24,4) as total_value,
  now() as refreshed_at
from public.procurements p
join public.organizations o on o.id = p.organization_id
join public.procurement_items pi on pi.procurement_id = p.id
left join public.results r on r.procurement_item_id = pi.id
group by 1, 2, 3, 4
with no data;

create index organization_summary_org_idx on public.organization_purchase_summary (organization_id, period_start desc);

create view public.price_history with (security_invoker = true) as
select
  pr.id,
  pr.product_id,
  p.grouped_name as product_name,
  pr.state_code,
  pr.observed_at,
  pr.unit,
  pr.quantity,
  pr.unit_price,
  pr.supplier_id,
  pr.organization_id,
  pr.source_id,
  pr.external_id,
  pr.imported_at
from public.price_records pr
left join public.products p on p.id = pr.product_id;

create or replace function public.refresh_market_analytics()
returns void language plpgsql security definer set search_path = '' as $$
begin
  refresh materialized view concurrently public.market_summary;
  refresh materialized view public.company_performance;
  refresh materialized view public.product_market_summary;
  refresh materialized view public.organization_purchase_summary;
end;
$$;

revoke all on public.market_summary, public.company_performance, public.product_market_summary, public.organization_purchase_summary from anon;
grant select on public.market_summary, public.company_performance, public.product_market_summary, public.organization_purchase_summary, public.price_history to authenticated;
revoke all on function public.refresh_market_analytics() from public, anon, authenticated;
grant execute on function public.refresh_market_analytics() to service_role;
