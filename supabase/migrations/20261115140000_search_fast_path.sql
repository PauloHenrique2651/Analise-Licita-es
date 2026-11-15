-- Busca de licitações: a parte aproximada (trigramas) só entra quando a busca normal acha pouco.
-- Antes, todo texto digitado também varria o índice de trigramas (26 mil candidatas para 0 acertos, ~1,5 s com 27 mil
-- licitações; escala linearmente com a base). A busca normal (índice FTS) leva ~1 ms.

drop function if exists public.search_procurements(text,text,text,text,text,text,text,text,timestamptz,timestamptz,timestamptz,numeric,numeric,integer,integer,text,text,text,boolean,text);

create or replace function public.search_procurements(
  p_text text default null,
  p_state text default null,
  p_city text default null,
  p_agency text default null,
  p_agency_cnpj text default null,
  p_modality text default null,
  p_source_code text default null,
  p_status text default null,
  p_published_from timestamptz default null,
  p_published_to timestamptz default null,
  p_proposal_until timestamptz default null,
  p_min_value numeric default null,
  p_max_value numeric default null,
  p_limit integer default 50,
  p_offset integer default 0,
  p_dispute_mode text default null,
  p_me_epp text default null,
  p_item_kind text default null,
  p_open_only boolean default false,
  p_city_ibge text default null
)
returns table (
  id uuid,
  control_number text,
  object_description text,
  agency_name text,
  agency_cnpj text,
  unit_name text,
  state_code char(2),
  city_name text,
  modality_name text,
  status_name text,
  published_at timestamptz,
  proposal_end_at timestamptz,
  estimated_value numeric,
  source_portal_name text,
  source_url text,
  dispute_mode text,
  me_epp_benefit text,
  item_kind text,
  rank real,
  total_count bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_text text := nullif(trim(p_text), '');
  v_query tsquery;
  v_fuzzy text := null;
begin
  if v_text is not null then
    v_query := websearch_to_tsquery('portuguese', v_text);
    -- Aproximada só se a busca normal trouxer menos de 5 resultados (erro de digitação, termo raro)
    if (select count(*) from (select 1 from public.procurements p where p.search_document @@ v_query limit 5) t) < 5 then
      v_fuzzy := v_text;
    end if;
  end if;

  return query
  select
    p.id, p.control_number, p.object_description, p.agency_name, p.agency_cnpj,
    p.unit_name, p.state_code, p.city_name, p.modality_name, p.status_name,
    p.published_at, p.proposal_end_at, p.estimated_value,
    p.source_portal_name, p.source_url,
    p.dispute_mode, p.me_epp_benefit, p.item_kind,
    case when v_text is null then 0::real
      else greatest(
        ts_rank_cd(p.search_document, v_query),
        case when v_fuzzy is null then 0::real else public.similarity(p.search_text, v_fuzzy)::real end
      ) end as rank,
    count(*) over() as total_count
  from public.procurements p
  join public.sources s on s.id = p.source_id
  where
    (v_text is null
      or p.search_document @@ v_query
      or (v_fuzzy is not null and p.search_text OPERATOR(public.%) v_fuzzy))
    and (p_state is null or p.state_code = upper(p_state))
    and (p_city_ibge is null or p.city_ibge_code = p_city_ibge)
    and (p_city is null or p.city_name ilike '%' || p_city || '%')
    and (p_agency is null or p.agency_name ilike '%' || p_agency || '%')
    and (p_agency_cnpj is null or p.agency_cnpj = regexp_replace(p_agency_cnpj, '\D', '', 'g'))
    and (p_modality is null or p.modality_name ilike '%' || p_modality || '%')
    and (p_source_code is null or s.code = upper(p_source_code))
    and (p_status is null or p.status_name ilike '%' || p_status || '%')
    and (p_published_from is null or p.published_at >= p_published_from)
    and (p_published_to is null or p.published_at <= p_published_to)
    and (p_proposal_until is null or p.proposal_end_at <= p_proposal_until)
    and (p_min_value is null or p.estimated_value >= p_min_value)
    and (p_max_value is null or p.estimated_value <= p_max_value)
    and (p_dispute_mode is null or p.dispute_mode ilike p_dispute_mode)
    and (p_me_epp is null
      or (p_me_epp = 'exclusiva' and p.me_epp_benefit = 'exclusiva')
      or (p_me_epp = 'com_beneficio' and p.me_epp_benefit in ('exclusiva', 'parcial'))
      or (p_me_epp = 'sem' and p.me_epp_benefit = 'sem'))
    and (p_item_kind is null or p.item_kind = p_item_kind or (p.item_kind = 'misto' and p_item_kind in ('material', 'servico')))
    and (not coalesce(p_open_only, false) or p.proposal_end_at > now())
  order by rank desc, p.published_at desc nulls last
  limit greatest(1, least(coalesce(p_limit, 50), 100))
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.search_procurements(text,text,text,text,text,text,text,text,timestamptz,timestamptz,timestamptz,numeric,numeric,integer,integer,text,text,text,boolean,text) from public, anon;
grant execute on function public.search_procurements(text,text,text,text,text,text,text,text,timestamptz,timestamptz,timestamptz,numeric,numeric,integer,integer,text,text,text,boolean,text) to authenticated;
