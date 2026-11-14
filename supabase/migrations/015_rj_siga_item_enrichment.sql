alter table public.procurement_items
  add column if not exists homologated_total_value numeric(20,4);

create or replace function public.refresh_procurement_item_search(p_source_code text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare affected bigint;
begin
  with item_text as (
    select pi.procurement_id, string_agg(pi.original_description, ' ' order by pi.item_number) as descriptions
    from public.procurement_items pi
    join public.sources s on s.id = pi.source_id
    where s.code = p_source_code
    group by pi.procurement_id
  )
  update public.procurements p
  set search_text = concat_ws(' ', p.object_description, p.description, p.agency_name, p.city_name, p.state_code, item_text.descriptions),
      updated_at = now()
  from item_text
  where p.id = item_text.procurement_id;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.refresh_procurement_item_search(text) from public, anon, authenticated;
grant execute on function public.refresh_procurement_item_search(text) to service_role;
