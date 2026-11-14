create or replace function public.refresh_market_analytics()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- REFRESH CONCURRENTLY não pode ser a primeira carga de uma materialized view WITH NO DATA.
  refresh materialized view public.market_summary;
  refresh materialized view public.company_performance;
  refresh materialized view public.product_market_summary;
  refresh materialized view public.organization_purchase_summary;
end;
$$;

revoke all on function public.refresh_market_analytics() from public, anon, authenticated;
grant execute on function public.refresh_market_analytics() to service_role;
