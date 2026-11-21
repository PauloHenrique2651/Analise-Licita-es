create index if not exists procurements_published_nulls_last_idx on public.procurements (published_at desc nulls last);

-- Lista de licitações sem nenhum filtro (a tela inicial de /app/licitacoes) levava 3 a 5 segundos porque contava e
-- ordenava as quase 1 milhão de linhas. Sem filtro, só interessa a página mais recente (índice por data) e o total
-- aproximado do catálogo. Com qualquer filtro, a busca continua exata como antes.
do $migration$
declare
  v_def text;
  v_marker constant text := E'begin\n  if v_text is not null then';
  v_fast constant text := $fast$begin
  if v_text is null and p_state is null and p_city is null and p_agency is null and p_agency_cnpj is null
     and p_modality is null and p_source_code is null and p_status is null and p_published_from is null
     and p_published_to is null and p_proposal_until is null and p_min_value is null and p_max_value is null
     and p_dispute_mode is null and p_me_epp is null and p_item_kind is null and p_city_ibge is null
     and not coalesce(p_open_only, false) then
    return query
    select p.id, p.control_number, p.object_description, p.agency_name, p.agency_cnpj,
           p.unit_name, p.state_code, p.city_name, p.modality_name, p.status_name,
           p.published_at, p.proposal_end_at, p.estimated_value, p.source_portal_name, p.source_url,
           p.dispute_mode, p.me_epp_benefit, p.item_kind, 0::real,
           (select c.reltuples::bigint from pg_class c where c.oid = 'public.procurements'::regclass),
           array(select distinct s3.code::text from public.procurement_sources ps3 join public.sources s3 on s3.id = ps3.source_id where ps3.procurement_id = p.id order by 1)
    from public.procurements p
    order by p.published_at desc nulls last
    limit greatest(1, least(coalesce(p_limit, 50), 100))
    offset greatest(coalesce(p_offset, 0), 0);
    return;
  end if;
  if v_text is not null then$fast$;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'search_procurements' and pronargs = 20;
  if v_def is null then raise exception 'search_procurements não encontrada'; end if;
  if position('p_city_ibge is null and not coalesce' in v_def) > 0 then return; end if; -- já aplicado
  if position(v_marker in replace(v_def, E'\r', '')) = 0 then raise exception 'ponto de inserção não encontrado'; end if;
  execute replace(replace(v_def, E'\r', ''), v_marker, v_fast);
end
$migration$;
