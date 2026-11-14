-- Benefício ME/EPP e tipo (material/serviço) derivados dos itens oficiais,
-- novos filtros na busca de licitações e painel diário de oportunidades.

-- 1. Campos por item, extraídos do JSON original do PNCP/Compras.gov.br
alter table public.procurement_items
  add column if not exists benefit_type text
    generated always as (nullif(trim(raw_data ->> 'tipoBeneficioNome'), '')) stored,
  add column if not exists item_kind text
    generated always as (
      case lower(left(coalesce(raw_data ->> 'materialOuServicoNome', raw_data ->> 'materialOuServico', ''), 1))
        when 'm' then 'material'
        when 's' then 'servico'
        else null
      end
    ) stored;

-- 2. Resumo por licitação
alter table public.procurements
  add column if not exists me_epp_benefit text check (me_epp_benefit in ('exclusiva', 'parcial', 'sem')),
  add column if not exists item_kind text check (item_kind in ('material', 'servico', 'misto'));

create index if not exists procurements_dispute_mode_idx on public.procurements (dispute_mode);
create index if not exists procurements_me_epp_idx on public.procurements (me_epp_benefit);
create index if not exists procurements_proposal_end_idx on public.procurements (proposal_end_at);

create or replace function public.refresh_procurement_flags(p_ids uuid[])
returns void
language sql
security definer
set search_path = ''
as $$
  with flags as (
    select
      i.procurement_id,
      count(*) as items,
      count(*) filter (where i.benefit_type ilike '%exclusiva%') as exclusive_items,
      count(*) filter (where i.benefit_type ilike '%cota%' or i.benefit_type ilike '%subcontrata%') as partial_items,
      count(*) filter (where i.item_kind = 'material') as materials,
      count(*) filter (where i.item_kind = 'servico') as services
    from public.procurement_items i
    where i.procurement_id = any(p_ids)
    group by i.procurement_id
  )
  update public.procurements p set
    me_epp_benefit = case
      when f.exclusive_items = f.items then 'exclusiva'
      when f.exclusive_items > 0 or f.partial_items > 0 then 'parcial'
      else 'sem'
    end,
    item_kind = case
      when f.materials > 0 and f.services > 0 then 'misto'
      when f.materials > 0 then 'material'
      when f.services > 0 then 'servico'
      else null
    end
  from flags f
  where p.id = f.procurement_id
$$;

revoke all on function public.refresh_procurement_flags(uuid[]) from public, anon, authenticated;
grant execute on function public.refresh_procurement_flags(uuid[]) to service_role;

create or replace function public.procurement_items_refresh_flags()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.refresh_procurement_flags(array(select distinct procurement_id from new_items));
  return null;
end;
$$;

drop trigger if exists procurement_items_flags_insert on public.procurement_items;
create trigger procurement_items_flags_insert
  after insert on public.procurement_items
  referencing new table as new_items
  for each statement execute function public.procurement_items_refresh_flags();

drop trigger if exists procurement_items_flags_update on public.procurement_items;
create trigger procurement_items_flags_update
  after update on public.procurement_items
  referencing new table as new_items
  for each statement execute function public.procurement_items_refresh_flags();

-- Carga inicial para licitações já sincronizadas
select public.refresh_procurement_flags(array(select distinct procurement_id from public.procurement_items));

-- 3. Busca com filtros de modo de disputa, ME/EPP e material/serviço
drop function if exists public.search_procurements(text,text,text,text,text,text,text,text,timestamptz,timestamptz,timestamptz,numeric,numeric,integer,integer);

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
  p_open_only boolean default false
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
language sql
stable
security invoker
set search_path = ''
as $$
  select
    p.id, p.control_number, p.object_description, p.agency_name, p.agency_cnpj,
    p.unit_name, p.state_code, p.city_name, p.modality_name, p.status_name,
    p.published_at, p.proposal_end_at, p.estimated_value,
    p.source_portal_name, p.source_url,
    p.dispute_mode, p.me_epp_benefit, p.item_kind,
    case when nullif(trim(p_text), '') is null then 0::real
      else greatest(
        ts_rank_cd(p.search_document, websearch_to_tsquery('portuguese', p_text)),
        public.similarity(p.search_text, p_text)::real
      ) end as rank,
    count(*) over() as total_count
  from public.procurements p
  join public.sources s on s.id = p.source_id
  where
    (nullif(trim(p_text), '') is null
      or p.search_document @@ websearch_to_tsquery('portuguese', p_text)
      or p.search_text OPERATOR(public.%) p_text)
    and (p_state is null or p.state_code = upper(p_state))
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
  offset greatest(coalesce(p_offset, 0), 0)
$$;

revoke all on function public.search_procurements(text,text,text,text,text,text,text,text,timestamptz,timestamptz,timestamptz,numeric,numeric,integer,integer,text,text,text,boolean) from public, anon;
grant execute on function public.search_procurements(text,text,text,text,text,text,text,text,timestamptz,timestamptz,timestamptz,numeric,numeric,integer,integer,text,text,text,boolean) to authenticated;

-- 4. Painel do dia (fuso de Brasília)
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
      now() as moment
  ),
  scoped as (
    select p.*
    from public.procurements p
    where p_state is null or p.state_code = upper(p_state)
  ),
  today as (
    select s.* from scoped s, bounds b where s.published_at >= b.day_start
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
    'open', (select count(*) from scoped s, bounds b where s.proposal_end_at > b.moment),
    'closingIn24h', (select count(*) from scoped s, bounds b where s.proposal_end_at > b.moment and s.proposal_end_at <= b.moment + interval '24 hours'),
    'byState', coalesce((
      select jsonb_agg(jsonb_build_object('state', state_code, 'count', total) order by total desc)
      from (select state_code, count(*) as total from today where state_code is not null group by state_code) x
    ), '[]'::jsonb)
  )
$$;

grant execute on function public.get_daily_opportunity_panel(text) to authenticated;
