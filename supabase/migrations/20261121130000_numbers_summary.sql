-- Painel "em números": totais por estado ou por município num período (a partir de market_city_month).
create or replace function public.numbers_summary(
  p_from date default null,
  p_to date default null,
  p_state text default null,
  p_group text default 'state'
)
returns table (state_code char(2), city_ibge_code char(7), name text, procurements bigint, items bigint, total_value numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  select m.state_code,
         case when p_group = 'city' then m.city_ibge_code end,
         case when p_group = 'city' then c.name else m.state_code::text end,
         sum(m.procurement_count)::bigint, sum(m.item_count)::bigint, coalesce(sum(m.total_value), 0)::numeric
  from public.market_city_month m
  join public.cities c on c.ibge_code = m.city_ibge_code
  where (p_from is null or m.period_start >= p_from)
    and (p_to is null or m.period_start <= p_to)
    and (nullif(trim(p_state), '') is null or m.state_code = upper(trim(p_state)))
  group by m.state_code, case when p_group = 'city' then m.city_ibge_code end, case when p_group = 'city' then c.name else m.state_code::text end
  order by 6 desc
  limit 6000
$$;
grant execute on function public.numbers_summary(date, date, text, text) to authenticated;
