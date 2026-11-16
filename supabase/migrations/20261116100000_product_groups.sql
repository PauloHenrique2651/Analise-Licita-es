create extension if not exists unaccent;
create extension if not exists pg_trgm;

-- Produtos agrupados: itens equivalentes (descrições diferentes) viram um produto, classificado por nicho,
-- com a lista de licitações em que aparece. Preenchido por scripts/build-product-groups.ts.

-- Unidade padronizada: UN, UND, UNIDADE e "Unidade" são a mesma coisa. Preços só são comparados na mesma unidade.
create or replace function public.normalize_unit(u text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when t.x = '' then null else case
    when t.x in ('UN','UND','UNID','UNIDADE','UNIDADES','UNI','UNITARIO','U','PC','PCA','PÇ','PECA','PEÇA','PECAS','PEÇAS','UNIDADE(S)') then 'UN'
    when t.x in ('M','MT','MTS','METRO','METROS','M LINEAR','METRO LINEAR') then 'M'
    when t.x in ('M2','M²','METRO QUADRADO','METROS QUADRADOS') then 'M²'
    when t.x in ('M3','M³','METRO CUBICO','METRO CÚBICO','METROS CUBICOS') then 'M³'
    when t.x in ('KG','KGS','KILO','QUILO','QUILOGRAMA','QUILOGRAMAS') then 'KG'
    when t.x in ('G','GR','GRAMA','GRAMAS') then 'G'
    when t.x in ('L','LT','LTS','LITRO','LITROS') then 'L'
    when t.x in ('ML','MILILITRO','MILILITROS') then 'ML'
    when t.x in ('CX','CXA','CAIXA','CAIXAS') then 'CX'
    when t.x in ('PCT','PT','PACOTE','PACOTES') then 'PCT'
    when t.x in ('KIT','KITS') then 'KIT'
    when t.x in ('PAR','PARES') then 'PAR'
    when t.x in ('RESMA','RESMAS','RM') then 'RESMA'
    when t.x in ('FR','FRS','FRASCO','FRASCOS') then 'FRASCO'
    when t.x in ('RL','ROLO','ROLOS') then 'ROLO'
    when t.x in ('GL','GALAO','GALÃO','GALOES','GALÕES') then 'GALÃO'
    when t.x in ('DZ','DUZIA','DÚZIA') then 'DÚZIA'
    when t.x in ('SV','SRV','SERVICO','SERVIÇO','SERVICOS','SERVIÇOS') then 'SERVIÇO'
    when t.x in ('H','HR','HORA','HORAS') then 'HORA'
    when t.x in ('MES','MÊS','MESES') then 'MÊS'
    when t.x in ('DIA','DIAS','DIARIA','DIÁRIA','DIARIAS','DIÁRIAS') then 'DIA'
    else t.x end end
  from (select upper(btrim(regexp_replace(coalesce(u, ''), '[.]', '', 'g'))) as x) t
$$;

create table if not exists public.product_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  canonical_key text not null unique,            -- 'pdm:<código>' (catálogo oficial) ou 'txt:<palavras>' (por descrição)
  niche text not null default 'Outros',
  kind text check (kind in ('material', 'servico')),
  catalog_group text,
  catalog_class text,
  pdm_code text,
  search_text text not null default '',          -- nome + descrições variantes, sem acento e em minúsculas (busca)
  item_count integer not null default 0,
  procurement_count integer not null default 0,
  description_variants integer not null default 0,
  unit text,                                      -- unidade mais frequente (as estatísticas de preço usam só ela)
  min_unit_value numeric,                         -- percentil 10 (faixa típica: descarta erros de digitação)
  median_unit_value numeric,
  max_unit_value numeric,                         -- percentil 90
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists product_groups_name_trgm_idx on public.product_groups using gin (name gin_trgm_ops);
create index if not exists product_groups_search_trgm_idx on public.product_groups using gin (search_text gin_trgm_ops);
create index if not exists product_groups_niche_idx on public.product_groups (niche, procurement_count desc);
create index if not exists product_groups_rank_idx on public.product_groups (procurement_count desc);

alter table public.procurement_items add column if not exists group_id uuid references public.product_groups(id) on delete set null;
create index if not exists procurement_items_group_idx on public.procurement_items (group_id, procurement_id);
create index if not exists procurement_items_ungrouped_idx on public.procurement_items (id) where group_id is null;

create table if not exists public.product_group_states (
  group_id uuid not null references public.product_groups(id) on delete cascade,
  state_code char(2) not null,
  procurement_count integer not null default 0,
  item_count integer not null default 0,
  primary key (group_id, state_code)
);
create index if not exists product_group_states_state_idx on public.product_group_states (state_code, procurement_count desc);

-- Dados públicos coletados: leitura para usuários logados; escrita só pela coleta (service_role)
alter table public.product_groups enable row level security;
alter table public.product_group_states enable row level security;
drop policy if exists product_groups_read on public.product_groups;
create policy product_groups_read on public.product_groups for select to authenticated using (true);
drop policy if exists product_group_states_read on public.product_group_states;
create policy product_group_states_read on public.product_group_states for select to authenticated using (true);

-- Lista de produtos agrupados (busca, nicho, UF)
create or replace function public.search_product_groups(
  p_text text default null,
  p_niche text default null,
  p_state text default null,
  p_limit integer default 30,
  p_offset integer default 0
)
returns table (
  id uuid, name text, niche text, kind text, catalog_group text, item_count integer, procurement_count integer,
  description_variants integer, unit text, min_unit_value numeric, median_unit_value numeric, max_unit_value numeric,
  last_seen_at timestamptz, states text[], total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (
    select nullif(trim(p_text), '') as txt,
           nullif(upper(trim(p_state)), '') as uf
  ), picked as (
    select g.*,
      case when q.txt is null then 0::real else public.similarity(g.name, q.txt)::real end as sim
    from public.product_groups g, q
    where g.item_count > 0 and g.canonical_key <> 'none'
      and (p_niche is null or g.niche = p_niche)
      and (q.txt is null
           or not exists (select 1 from regexp_split_to_table(public.unaccent(lower(q.txt)), '\s+') w
                          where w <> '' and g.search_text not like '%' || w || '%'))
      and (q.uf is null or exists (select 1 from public.product_group_states s where s.group_id = g.id and s.state_code = q.uf))
  )
  select p.id, p.name, p.niche, p.kind, p.catalog_group, p.item_count, p.procurement_count, p.description_variants,
         p.unit, p.min_unit_value, p.median_unit_value, p.max_unit_value, p.last_seen_at,
         array(select s.state_code::text from public.product_group_states s where s.group_id = p.id order by s.procurement_count desc limit 6),
         count(*) over()
  from picked p
  order by p.sim desc, p.procurement_count desc, p.name
  limit greatest(1, least(coalesce(p_limit, 30), 100))
  offset greatest(coalesce(p_offset, 0), 0)
$$;

-- Nichos com contagem (para os filtros)
create or replace function public.product_group_niches(p_state text default null)
returns table (niche text, groups bigint, procurements bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select g.niche, count(*), coalesce(sum(g.procurement_count), 0)::bigint
  from public.product_groups g
  where g.item_count > 0 and g.canonical_key <> 'none'
    and (nullif(trim(p_state), '') is null or exists (select 1 from public.product_group_states s where s.group_id = g.id and s.state_code = upper(trim(p_state))))
  group by g.niche
  order by 3 desc
$$;

-- Licitações em que o produto aparece, com o link do portal oficial
create or replace function public.product_group_procurements(
  p_group_id uuid,
  p_state text default null,
  p_limit integer default 25,
  p_offset integer default 0
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
  order by p.published_at desc nulls last, i.item_number
  limit greatest(1, least(coalesce(p_limit, 25), 100))
  offset greatest(coalesce(p_offset, 0), 0)
$$;

-- Descrições diferentes que foram reunidas no produto (para mostrar "também aparece como...")
create or replace function public.product_group_variants(p_group_id uuid, p_limit integer default 8)
returns table (description text, occurrences bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select left(i.original_description, 140), count(*)
  from public.procurement_items i
  where i.group_id = p_group_id
  group by 1
  order by 2 desc
  limit greatest(1, least(coalesce(p_limit, 8), 20))
$$;

revoke all on function public.search_product_groups(text, text, text, integer, integer) from public, anon;
revoke all on function public.product_group_niches(text) from public, anon;
revoke all on function public.product_group_procurements(uuid, text, integer, integer) from public, anon;
revoke all on function public.product_group_variants(uuid, integer) from public, anon;
grant execute on function public.search_product_groups(text, text, text, integer, integer) to authenticated;
grant execute on function public.product_group_niches(text) to authenticated;
grant execute on function public.product_group_procurements(uuid, text, integer, integer) to authenticated;
grant execute on function public.product_group_variants(uuid, integer) to authenticated;
