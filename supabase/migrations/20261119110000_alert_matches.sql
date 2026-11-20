-- Alertas por grupo de palavras: licitações recentes que combinam com um perfil.
-- Palavras-chave: qualquer uma (cada uma pode ter várias palavras, todas precisam aparecer). Palavras excluídas: se qualquer
-- uma aparecer, a licitação sai. Municípios: lista de códigos IBGE (vazia = qualquer município do estado/Brasil).

create or replace function public.match_alert_procurements(
  p_keywords text[] default '{}',
  p_exclude text[] default '{}',
  p_state text default null,
  p_cities text[] default '{}',
  p_since timestamptz default (now() - interval '7 days'),
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid,
  control_number text,
  object_description text,
  agency_name text,
  state_code char(2),
  city_name text,
  published_at timestamptz,
  proposal_end_at timestamptz,
  estimated_value numeric,
  total_count bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_include tsquery;
  v_exclude tsquery;
  v_word text;
  v_query tsquery;
  v_state text := nullif(upper(trim(p_state)), '');
begin
  foreach v_word in array coalesce(p_keywords, '{}') loop
    v_word := nullif(trim(v_word), '');
    if v_word is null then continue; end if;
    v_query := websearch_to_tsquery('portuguese', v_word);
    if v_query::text = '' then continue; end if;
    v_include := case when v_include is null then v_query else v_include || v_query end;
  end loop;
  foreach v_word in array coalesce(p_exclude, '{}') loop
    v_word := nullif(trim(v_word), '');
    if v_word is null then continue; end if;
    v_query := websearch_to_tsquery('portuguese', v_word);
    if v_query::text = '' then continue; end if;
    v_exclude := case when v_exclude is null then v_query else v_exclude || v_query end;
  end loop;

  return query
  select p.id, p.control_number, p.object_description, p.agency_name, p.state_code, p.city_name,
         p.published_at, p.proposal_end_at, p.estimated_value, count(*) over() as total_count
  from public.procurements p
  where p.published_at >= p_since
    and (v_include is null or p.search_document @@ v_include)
    and (v_exclude is null or not (p.search_document @@ v_exclude))
    and (v_state is null or p.state_code = v_state)
    and (coalesce(cardinality(p_cities), 0) = 0 or p.city_ibge_code = any(p_cities))
  order by p.published_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;
grant execute on function public.match_alert_procurements(text[], text[], text, text[], timestamptz, integer, integer) to authenticated;
