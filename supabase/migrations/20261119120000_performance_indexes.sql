-- Desempenho: índices que faltavam e atualização das tabelas de resumo sem empilhar.
-- Medido em produção: `results` lida por item sem índice (1,8 milhão de leituras da tabela inteira) e `products` pesquisada por
-- código/descrição sem índice (210 mil leituras da tabela inteira); várias atualizações dos resumos rodavam ao mesmo tempo.

create index if not exists results_item_supplier_idx on public.results (procurement_item_id, supplier_id);
create index if not exists products_catmat_idx on public.products (product_type, catmat_code) where catmat_code is not null;
create index if not exists products_catser_idx on public.products (product_type, catser_code) where catser_code is not null;
create index if not exists products_description_hash_idx on public.products using hash (normalized_description);

-- Rankings do mercado filtram por estado e ordenam por valor
create index if not exists product_market_summary_state_value_idx on public.product_market_summary (state_code, total_value desc);
create index if not exists organization_summary_state_value_idx on public.organization_purchase_summary (state_code, total_value desc);
create index if not exists company_performance_state_value_idx on public.company_performance (state_code, won_value desc);

-- Atualização dos resumos: uma por vez (as demais chamadas saem sem fazer nada) e no máximo a cada 30 minutos.
-- As duas principais usam CONCURRENTLY, então a tela de mercado continua lendo enquanto atualizam.
create or replace function public.refresh_market_analytics()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not pg_try_advisory_xact_lock(727001) then return; end if;
  if (select max(refreshed_at) from public.market_summary) > now() - interval '30 minutes' then return; end if;
  refresh materialized view concurrently public.market_summary;
  refresh materialized view concurrently public.market_city_month;
  refresh materialized view public.company_performance;
  refresh materialized view public.product_market_summary;
  refresh materialized view public.organization_purchase_summary;
end;
$$;
revoke all on function public.refresh_market_analytics() from public, anon, authenticated;
grant execute on function public.refresh_market_analytics() to service_role;
