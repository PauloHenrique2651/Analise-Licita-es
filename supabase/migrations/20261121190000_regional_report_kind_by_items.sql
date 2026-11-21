-- Relatório regional: o filtro produto/serviço passa a usar os itens (quase todos classificados) em vez do campo da licitação
-- (vazio em 92% delas). Licitações sem itens coletados são classificadas pelo texto do objeto, e o relatório informa quantas.

create or replace function public.regional_report(
  p_cities text[],
  p_from date default (current_date - interval '1 year')::date,
  p_to date default current_date,
  p_item_kind text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set plan_cache_mode = force_custom_plan
as $$
declare
  v_ids uuid[];
  v_all bigint;
  v_with_items bigint;
  v_by_text bigint;
  v_result jsonb;
begin
  -- Primeiro a lista de licitações da região (usa o índice por município e data); o resto parte dessa lista.
  -- Sem isso o planejador varria a tabela inteira de licitações e de itens (mais de 1 minuto).
  -- Tipo (produto/serviço) vem dos itens da licitação: a licitação entra se tem ao menos um item do tipo escolhido.
  -- Licitações cujos itens ainda não foram coletados não dá para classificar; o relatório informa quantas são (scope).
  select coalesce(array_agg(x.id) filter (where x.kind_ok), '{}'), count(*), count(*) filter (where x.has_items),
         count(*) filter (where x.kind_ok and not x.has_items and nullif(p_item_kind, '') is not null)
    into v_ids, v_all, v_with_items, v_by_text
  from (
    select pr.id,
           exists (select 1 from public.procurement_items i where i.procurement_id = pr.id) as has_items,
           (nullif(p_item_kind, '') is null
             or exists (select 1 from public.procurement_items i where i.procurement_id = pr.id and i.item_kind = p_item_kind)
             -- sem itens coletados: classifica pelo texto do objeto (palavras típicas de serviço ou de aquisição)
             or (not exists (select 1 from public.procurement_items i where i.procurement_id = pr.id)
                 and case when p_item_kind = 'servico'
                       then pr.object_description ~* '(contrata[cç][aã]o de empresa|presta[cç][aã]o de servi|servi[cç]os? (de|especializad|t[eé]cnic|continuad)|manuten[cç][aã]o|execu[cç][aã]o de obra|obras? de|reforma|loca[cç][aã]o|elabora[cç][aã]o de projeto|credenciamento|assessoria|consultoria|vigil[aâ]ncia|limpeza)'
                       else pr.object_description ~* '(aquisi[cç][aã]o|compra de|fornecimento|registro de pre[cç]os? (para )?(a )?(aquisi|compra|fornecimento)|materiais?|medicamentos?|g[eê]neros aliment[ií]cios|equipamentos?|insumos?)' end)) as kind_ok
    from public.procurements pr
    where pr.city_ibge_code = any(p_cities::char(7)[])
      and pr.published_at >= p_from and pr.published_at < (p_to + 1)
  ) x;

  with p as materialized (
    select pr.id, pr.city_ibge_code, pr.agency_name, pr.modality_name, pr.dispute_mode, pr.me_epp_benefit, pr.item_kind,
           pr.source_portal_name, pr.published_at, pr.proposal_end_at, pr.control_number, pr.object_description,
           coalesce(nullif(pr.homologated_value, 0), pr.estimated_value) as ov,
           case when coalesce(nullif(pr.homologated_value, 0), pr.estimated_value) < 200000000
                then coalesce(nullif(pr.homologated_value, 0), pr.estimated_value) end as v
    from public.procurements pr
    where pr.id = any(v_ids)
  ),
  it as materialized (
    select i.id, i.procurement_id, i.group_id,
           case when i.estimated_total_value < 200000000 then i.estimated_total_value end as tv
    from public.procurement_items i
    where i.procurement_id = any(v_ids)
  )
  select jsonb_build_object(
    'scope', jsonb_build_object('all', v_all, 'withItems', v_with_items, 'byText', v_by_text, 'kind', nullif(p_item_kind, '')),
    'totals', (select jsonb_build_object(
        'procurements', count(*), 'value', coalesce(sum(v), 0), 'avgValue', coalesce(avg(v), 0),
        'medianValue', coalesce(percentile_cont(0.5) within group (order by v), 0),
        'agencies', count(distinct agency_name), 'cities', count(distinct city_ibge_code),
        'withoutValue', count(*) filter (where ov is null),
        'outliers', count(*) filter (where ov >= 200000000), 'outlierValue', coalesce(sum(ov) filter (where ov >= 200000000), 0),
        'avgDeadlineDays', (select coalesce(avg(extract(epoch from (proposal_end_at - published_at)) / 86400), 0)
                            from p where proposal_end_at > published_at and proposal_end_at < published_at + interval '120 days'),
        'items', (select count(*) from it)
      ) from p),
    'monthly', coalesce((select jsonb_agg(jsonb_build_object('month', to_char(m, 'YYYY-MM'), 'count', c, 'value', s) order by m)
                         from (select date_trunc('month', published_at) m, count(*) c, coalesce(sum(v), 0) s from p group by 1) x), '[]'::jsonb),
    'byCity', coalesce((select jsonb_agg(jsonb_build_object('ibge', a.ibge, 'name', c.name, 'count', a.c, 'value', a.s, 'items', coalesce(b.n, 0)) order by a.s desc)
                        from (select city_ibge_code ibge, count(*) c, coalesce(sum(v), 0) s from p group by 1) a
                        join public.cities c on c.ibge_code = a.ibge
                        left join (select p.city_ibge_code ibge, count(*) n from it join p on p.id = it.procurement_id group by 1) b on b.ibge = a.ibge), '[]'::jsonb),
    'byModality', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'count', c, 'value', s) order by c desc)
                            from (select coalesce(modality_name, 'Não informada') name, count(*) c, coalesce(sum(v), 0) s from p group by 1) x), '[]'::jsonb),
    'byDispute', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'count', c) order by c desc)
                           from (select coalesce(dispute_mode, 'Não informado') name, count(*) c from p group by 1) x), '[]'::jsonb),
    'byMeEpp', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'count', c) order by c desc)
                         from (select coalesce(me_epp_benefit, 'não informado') name, count(*) c from p group by 1) x), '[]'::jsonb),
    'byPortal', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'count', c) order by c desc)
                          from (select coalesce(source_portal_name, 'Não informado') name, count(*) c from p group by 1) x), '[]'::jsonb),
    'byKind', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'count', c, 'value', s) order by c desc)
                        from (select coalesce(item_kind, 'não classificado') name, count(*) c, coalesce(sum(v), 0) s from p group by 1) x), '[]'::jsonb),
    'ranges', (select jsonb_build_object(
        'upTo50k', count(*) filter (where v <= 50000), 'upTo250k', count(*) filter (where v > 50000 and v <= 250000),
        'upTo1m', count(*) filter (where v > 250000 and v <= 1000000), 'above1m', count(*) filter (where v > 1000000),
        'noValue', count(*) filter (where ov is null)) from p),
    'topAgencies', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'count', c, 'value', s) order by s desc)
                             from (select agency_name name, count(*) c, coalesce(sum(v), 0) s from p where agency_name is not null group by 1 order by 3 desc limit 10) x), '[]'::jsonb),
    'topProcurements', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'control', control_number, 'object', left(object_description, 160), 'agency', agency_name, 'city', city, 'value', v, 'date', published_at) order by v desc)
                                 from (select p.id, p.control_number, p.object_description, p.agency_name, c.name city, p.v, p.published_at
                                       from p join public.cities c on c.ibge_code = p.city_ibge_code where p.v is not null order by p.v desc limit 10) x), '[]'::jsonb),
    'byNiche', coalesce((select jsonb_agg(jsonb_build_object('name', niche, 'items', n, 'value', s, 'procurements', pc) order by n desc)
                         from (select g.niche, count(*) n, coalesce(sum(it.tv), 0) s, count(distinct it.procurement_id) pc
                               from it join public.product_groups g on g.id = it.group_id group by g.niche) x), '[]'::jsonb),
    'topProducts', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'niche', niche, 'items', n, 'procurements', pc, 'value', s) order by pc desc)
                             from (select g.name, g.niche, count(*) n, count(distinct it.procurement_id) pc, coalesce(sum(it.tv), 0) s
                                   from it join public.product_groups g on g.id = it.group_id group by g.id, g.name, g.niche order by pc desc limit 12) x), '[]'::jsonb),
    'topSuppliers', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'wins', w, 'value', s) order by s desc)
                              from (select su.legal_name name, count(*) w, coalesce(sum(case when r.total_value < 200000000 then r.total_value end), 0) s
                                    from it join public.results r on r.procurement_item_id = it.id and r.winner
                                    join public.suppliers su on su.id = r.supplier_id group by su.id, su.legal_name order by 3 desc limit 10) x), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;
grant execute on function public.regional_report(text[], date, date, text) to authenticated;
