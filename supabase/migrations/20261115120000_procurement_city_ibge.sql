-- Município da licitação por código IBGE (exato e indexado), em vez de texto livre.
-- Antes: o mesmo município aparecia com várias grafias (caixa/acento) e a busca por cidade era "ilike %texto%".

alter table public.procurements
  add column if not exists city_ibge_code char(7) references public.cities(ibge_code);

-- Preenche pela organização compradora (o município do órgão é o da contratação nos dados coletados)
update public.procurements p
set city_ibge_code = o.city_ibge_code
from public.organizations o
where o.id = p.organization_id and o.city_ibge_code is not null and p.city_ibge_code is distinct from o.city_ibge_code;

-- Nome canônico (IBGE) para todos os que têm código
update public.procurements p
set city_name = c.name
from public.cities c
where c.ibge_code = p.city_ibge_code and p.city_name is distinct from c.name;

-- Novas licitações e atualizações recebem código e nome canônico automaticamente
create or replace function public.procurements_set_city()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.city_ibge_code is null and new.organization_id is not null then
    select o.city_ibge_code into new.city_ibge_code from public.organizations o where o.id = new.organization_id;
  end if;
  if new.city_ibge_code is not null then
    select c.name into new.city_name from public.cities c where c.ibge_code = new.city_ibge_code;
  end if;
  return new;
end;
$$;

drop trigger if exists procurements_set_city on public.procurements;
create trigger procurements_set_city
  before insert or update of organization_id, city_ibge_code on public.procurements
  for each row execute function public.procurements_set_city();

create index if not exists procurements_city_ibge_published_idx
  on public.procurements (city_ibge_code, published_at desc nulls last);

-- Busca: novo filtro p_city_ibge (exato). O filtro p_city (texto) continua para quem digita o nome.
drop function if exists public.search_procurements(text,text,text,text,text,text,text,text,timestamptz,timestamptz,timestamptz,numeric,numeric,integer,integer,text,text,text,boolean);

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
  offset greatest(coalesce(p_offset, 0), 0)
$$;

revoke all on function public.search_procurements(text,text,text,text,text,text,text,text,timestamptz,timestamptz,timestamptz,numeric,numeric,integer,integer,text,text,text,boolean,text) from public, anon;
grant execute on function public.search_procurements(text,text,text,text,text,text,text,text,timestamptz,timestamptz,timestamptz,numeric,numeric,integer,integer,text,text,text,boolean,text) to authenticated;

-- Resumo por município (uma linha por IBGE, nunca por grafia)
create or replace function public.procurements_by_city(p_state text default null, p_days integer default 365)
returns table (city_ibge_code char(7), city_name text, state_code char(2), procurements bigint, total_value numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.city_ibge_code, c.name, c.state_code, count(*), coalesce(sum(p.estimated_value), 0)
  from public.procurements p
  join public.cities c on c.ibge_code = p.city_ibge_code
  where p.city_ibge_code is not null
    and (p_state is null or c.state_code = upper(p_state))
    and p.published_at >= now() - make_interval(days => greatest(1, least(coalesce(p_days, 365), 1100)))
  group by p.city_ibge_code, c.name, c.state_code
  order by 4 desc
  limit 1000
$$;
revoke all on function public.procurements_by_city(text, integer) from public, anon;
grant execute on function public.procurements_by_city(text, integer) to authenticated;
