-- Painel "Hoje" levava de 4 a 28 segundos: contava propostas abertas lendo a tabela inteira de licitações (sem índice em
-- proposal_end_at) e copiava a linha completa (inclui o JSON bruto) de cada licitação do dia.

create index if not exists procurements_proposal_end_idx on public.procurements (proposal_end_at) where proposal_end_at is not null;
create index if not exists procurements_state_proposal_end_idx on public.procurements (state_code, proposal_end_at) where proposal_end_at is not null;

create or replace function public.get_daily_opportunity_panel(p_state text default null)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with bounds as (
    select
      (date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo') as day_start,
      now() as moment,
      nullif(upper(trim(p_state)), '') as uf
  ),
  today as materialized (
    select p.id, p.estimated_value, p.item_kind, p.me_epp_benefit, p.state_code
    from public.procurements p, bounds b
    where p.published_at >= b.day_start and (b.uf is null or p.state_code = b.uf)
  ),
  open_now as (
    select count(*) as total, count(*) filter (where p.proposal_end_at <= b.moment + interval '24 hours') as closing
    from public.procurements p, bounds b
    where p.proposal_end_at > b.moment and (b.uf is null or p.state_code = b.uf)
  )
  select jsonb_build_object(
    'generatedAt', (select moment from bounds),
    'dayStart', (select day_start from bounds),
    'publishedToday', (select count(*) from today),
    'itemsToday', (select count(*) from public.procurement_items i join today t on t.id = i.procurement_id),
    'valueToday', (select coalesce(sum(estimated_value), 0) from today),
    'materialsToday', (select count(*) from today where item_kind in ('material', 'misto')),
    'servicesToday', (select count(*) from today where item_kind in ('servico', 'misto')),
    'upTo50k', (select count(*) from today where estimated_value <= 50000),
    'upTo250k', (select count(*) from today where estimated_value > 50000 and estimated_value <= 250000),
    'above250k', (select count(*) from today where estimated_value > 250000),
    'withoutValue', (select count(*) from today where estimated_value is null),
    'meEppToday', (select count(*) from today where me_epp_benefit in ('exclusiva', 'parcial')),
    'open', (select total from open_now),
    'closingIn24h', (select closing from open_now),
    'byState', coalesce((
      select jsonb_agg(jsonb_build_object('state', state_code, 'count', total) order by total desc)
      from (select state_code, count(*) as total from today where state_code is not null group by state_code) x
    ), '[]'::jsonb)
  )
$$;
grant execute on function public.get_daily_opportunity_panel(text) to authenticated;
