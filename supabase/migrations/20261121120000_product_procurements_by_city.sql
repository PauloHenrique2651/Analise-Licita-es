-- Licitações de um produto agora podem ser filtradas por um ou mais municípios (lista de códigos IBGE).
drop function if exists public.product_group_procurements(uuid, text, integer, integer);

create or replace function public.product_group_procurements(
  p_group_id uuid,
  p_state text default null,
  p_limit integer default 25,
  p_offset integer default 0,
  p_cities text[] default '{}'
)
returns table (
  procurement_id uuid, control_number text, object_description text, agency_name text, state_code char(2), city_name text,
  published_at timestamptz, proposal_end_at timestamptz, status_name text, source_portal_name text, source_url text,
  item_description text, quantity numeric, unit text, unit_value numeric, total_value numeric, total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.id, p.control_number, p.object_description, p.agency_name, p.state_code, p.city_name,
         p.published_at, p.proposal_end_at, p.status_name, p.source_portal_name, p.source_url,
         i.original_description, i.quantity, i.unit, i.estimated_unit_value, i.estimated_total_value,
         count(*) over()
  from public.procurement_items i
  join public.procurements p on p.id = i.procurement_id
  where i.group_id = p_group_id
    and (nullif(trim(p_state), '') is null or p.state_code = upper(trim(p_state)))
    and (coalesce(cardinality(p_cities), 0) = 0 or p.city_ibge_code = any(p_cities))
  order by p.published_at desc nulls last, i.item_number
  limit greatest(1, least(coalesce(p_limit, 25), 100))
  offset greatest(coalesce(p_offset, 0), 0)
$$;
revoke all on function public.product_group_procurements(uuid, text, integer, integer, text[]) from public, anon;
grant execute on function public.product_group_procurements(uuid, text, integer, integer, text[]) to authenticated;
