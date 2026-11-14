-- Camada canônica para agregação multiportal sem duplicar as tabelas já existentes.
alter table public.sources
  add column if not exists integration_status text not null default 'active'
    check (integration_status in ('active', 'degraded', 'disabled', 'no_public_api_confirmed')),
  add column if not exists priority smallint not null default 100,
  add column if not exists last_verified_at timestamptz;

alter table public.procurements
  add column if not exists canonical_key text,
  add column if not exists source_portal_name text,
  add column if not exists source_url text,
  add column if not exists pncp_id text,
  add column if not exists notice_number text,
  add column if not exists description text,
  add column if not exists dispute_mode text,
  add column if not exists agency_name text,
  add column if not exists agency_cnpj text,
  add column if not exists unit_name text,
  add column if not exists unit_code text,
  add column if not exists state_code char(2) references public.states(code),
  add column if not exists city_name text,
  add column if not exists opening_at timestamptz,
  add column if not exists edital_url text,
  add column if not exists search_text text not null default '',
  add column if not exists search_document tsvector generated always as
    (to_tsvector('portuguese', coalesce(search_text, ''))) stored,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists procurements_canonical_key_uidx
  on public.procurements (canonical_key);
create unique index if not exists procurements_pncp_id_uidx
  on public.procurements (pncp_id);
create index if not exists procurements_source_idx on public.procurements (source_id);
create index if not exists procurements_agency_cnpj_idx on public.procurements (agency_cnpj);
create index if not exists procurements_state_idx on public.procurements (state_code);
create index if not exists procurements_city_idx on public.procurements (city_name);
create index if not exists procurements_modality_idx on public.procurements (modality_name);
create index if not exists procurements_proposal_end_idx on public.procurements (proposal_end_at);
create index if not exists procurements_status_idx on public.procurements (status_name);
create index if not exists procurements_search_fts_idx on public.procurements using gin (search_document);
create index if not exists procurements_search_trgm_idx on public.procurements using gin (search_text gin_trgm_ops);

create unique index if not exists procurement_items_procurement_number_uidx
  on public.procurement_items (procurement_id, item_number);

create table if not exists public.procurement_sources (
  id uuid primary key default gen_random_uuid(),
  procurement_id uuid not null references public.procurements(id) on delete cascade,
  source_id uuid not null references public.sources(id),
  external_id text not null,
  source_url text,
  source_endpoint text not null,
  is_primary boolean not null default false,
  raw_data jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default now(),
  source_updated_at timestamptz,
  unique (source_id, external_id),
  unique (procurement_id, source_id, external_id)
);

create index if not exists procurement_sources_procurement_idx
  on public.procurement_sources (procurement_id);

create table if not exists public.procurement_sync_state (
  id uuid primary key default gen_random_uuid(),
  provider text not null unique,
  last_sync_at timestamptz,
  last_success_at timestamptz,
  last_cursor text,
  last_page integer,
  last_error text,
  consecutive_failures integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.procurement_sources enable row level security;
alter table public.procurement_sync_state enable row level security;

create policy procurement_sources_authenticated_read on public.procurement_sources
  for select to authenticated using (true);
create policy procurement_sync_state_authenticated_read on public.procurement_sync_state
  for select to authenticated using (true);

grant select on public.procurement_sources, public.procurement_sync_state to authenticated;

insert into public.sources
  (code, name, base_url, documentation_url, auth_type, reliability_notes, active, integration_status, priority, last_verified_at)
values
  ('PORTAL_COMPRAS_PUBLICAS', 'Portal de Compras Públicas', 'https://www.portaldecompraspublicas.com.br/', 'https://www.portaldecompraspublicas.com.br/', 'none', 'SEM API PÚBLICA GERAL CONFIRMADA; consultar prioritariamente via PNCP.', false, 'no_public_api_confirmed', 300, now()),
  ('BLL_COMPRAS', 'BLL Compras', 'https://bllcompras.com/', 'https://bllcompras.com/', 'none', 'SEM API PÚBLICA GERAL CONFIRMADA.', false, 'no_public_api_confirmed', 310, now()),
  ('BNC_COMPRAS', 'BNC Compras', 'https://bnccompras.com/', 'https://bnccompras.com/', 'none', 'SEM API PÚBLICA GERAL CONFIRMADA.', false, 'no_public_api_confirmed', 320, now()),
  ('LICITANET', 'LICITANET', 'https://licitanet.com.br/', 'https://licitanet.com.br/', 'none', 'SEM API PÚBLICA GERAL CONFIRMADA.', false, 'no_public_api_confirmed', 330, now()),
  ('BBMNET', 'BBMNET', 'https://www.novobbmnet.com.br/', 'https://www.novobbmnet.com.br/', 'none', 'SEM API PÚBLICA GERAL CONFIRMADA.', false, 'no_public_api_confirmed', 340, now()),
  ('LICITACOES_E', 'Licitações-e / Banco do Brasil', 'https://licitacoes-e2.bb.com.br/', 'https://www.bb.com.br/site/developers/', 'none', 'SEM API PÚBLICA GERAL CONFIRMADA para consulta de licitações.', false, 'no_public_api_confirmed', 350, now()),
  ('COMPRASNET_GO', 'Comprasnet Goiás', 'https://www.comprasnet.go.gov.br/', 'https://www.comprasnet.go.gov.br/', 'none', 'SEM API PÚBLICA GERAL CONFIRMADA.', false, 'no_public_api_confirmed', 360, now()),
  ('COMPRAS_MG', 'Compras MG', 'https://www.compras.mg.gov.br/', 'https://www.compras.mg.gov.br/', 'none', 'SEM API PÚBLICA GERAL CONFIRMADA.', false, 'no_public_api_confirmed', 370, now()),
  ('PE_INTEGRADO', 'PE Integrado', 'https://www.peintegrado.pe.gov.br/', 'https://www.peintegrado.pe.gov.br/', 'none', 'SEM API PÚBLICA GERAL CONFIRMADA.', false, 'no_public_api_confirmed', 380, now()),
  ('COMPRAS_RS', 'Compras RS', 'https://www.compras.rs.gov.br/', 'https://www.compras.rs.gov.br/', 'none', 'SEM API PÚBLICA GERAL CONFIRMADA.', false, 'no_public_api_confirmed', 390, now()),
  ('LICITAR_DIGITAL', 'Licitar Digital', 'https://licitar.digital/', 'https://licitar.digital/', 'none', 'SEM API PÚBLICA GERAL CONFIRMADA.', false, 'no_public_api_confirmed', 400, now())
on conflict (code) do update set
  name = excluded.name,
  base_url = excluded.base_url,
  documentation_url = excluded.documentation_url,
  reliability_notes = excluded.reliability_notes,
  active = excluded.active,
  integration_status = excluded.integration_status,
  priority = excluded.priority,
  last_verified_at = excluded.last_verified_at;

update public.sources set priority = 10, integration_status = 'active', last_verified_at = now() where code = 'PNCP';
update public.sources set priority = 20, integration_status = 'active', last_verified_at = now() where code = 'COMPRAS_GOV';

-- Permite que o dashboard mostre processos válidos mesmo antes de itens/resultados chegarem.
drop materialized view if exists public.market_summary;
create materialized view public.market_summary as
select
  date_trunc('month', coalesce(p.published_at, p.imported_at))::date as period_start,
  coalesce(p.state_code, o.state_code) as state_code,
  count(distinct p.id)::bigint as procurement_count,
  count(distinct pi.id)::bigint as item_count,
  count(distinct r.supplier_id)::bigint as supplier_count,
  count(distinct p.organization_id)::bigint as organization_count,
  count(distinct p.id)::bigint as record_count,
  coalesce(sum(case when r.winner then r.total_value else 0 end), 0)::numeric(24,4) as total_value,
  coalesce(avg(case when r.winner then r.unit_value end), 0)::numeric(24,4) as average_winner_price,
  coalesce(sum(case when r.winner then r.total_value else 0 end) / nullif(count(distinct p.id), 0), 0)::numeric(24,4) as average_ticket,
  now() as refreshed_at
from public.procurements p
join public.organizations o on o.id = p.organization_id
left join public.procurement_items pi on pi.procurement_id = p.id
left join public.results r on r.procurement_item_id = pi.id
group by 1, 2
with no data;

create unique index market_summary_period_state_idx on public.market_summary (period_start, state_code);
grant select on public.market_summary to authenticated;

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
  p_offset integer default 0
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
  order by rank desc, p.published_at desc nulls last
  limit greatest(1, least(coalesce(p_limit, 50), 100))
  offset greatest(coalesce(p_offset, 0), 0)
$$;

revoke all on function public.search_procurements(text,text,text,text,text,text,text,text,timestamptz,timestamptz,timestamptz,numeric,numeric,integer,integer) from public, anon;
grant execute on function public.search_procurements(text,text,text,text,text,text,text,text,timestamptz,timestamptz,timestamptz,numeric,numeric,integer,integer) to authenticated;
