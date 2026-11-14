create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create type public.user_role as enum ('owner', 'admin', 'analyst', 'sales', 'viewer');
create type public.sync_status as enum ('running', 'succeeded', 'partial', 'failed');
create type public.match_status as enum ('confirmed', 'probable', 'needs_validation');

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  active_tenant_id uuid references public.tenants(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tenant_members (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role public.user_role not null default 'viewer',
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create or replace function public.current_tenant_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select active_tenant_id from public.users where id = (select auth.uid())
$$;

create or replace function public.is_tenant_member(requested_tenant uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.tenant_members
    where tenant_id = requested_tenant and user_id = (select auth.uid())
  )
$$;

create table public.states (
  code char(2) primary key,
  name text not null,
  region text not null,
  ibge_code char(2) unique
);

create table public.cities (
  ibge_code char(7) primary key,
  state_code char(2) not null references public.states(code),
  name text not null
);

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  base_url text not null,
  documentation_url text not null,
  auth_type text not null default 'none',
  reliability_notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.portals (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources(id),
  name text not null,
  url text,
  unique (source_id, name)
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  cnpj char(14),
  legal_name text not null,
  unit_code text,
  unit_name text,
  city_ibge_code char(7) references public.cities(ibge_code),
  state_code char(2) references public.states(code),
  source_id uuid not null references public.sources(id),
  external_id text not null,
  source_endpoint text not null,
  imported_at timestamptz not null default now(),
  source_updated_at timestamptz,
  unique (source_id, external_id)
);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  cnpj char(14) not null,
  legal_name text not null,
  trade_name text,
  registration_status text,
  company_size text,
  legal_nature text,
  share_capital numeric(18,2),
  zip_code char(8),
  street text,
  number text,
  complement text,
  district text,
  city_name text,
  state_code char(2) references public.states(code),
  primary_cnae text,
  raw_data jsonb not null default '{}'::jsonb,
  source_id uuid references public.sources(id),
  source_endpoint text,
  external_id text,
  imported_at timestamptz,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (tenant_id, cnpj)
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  cnpj_cpf text not null,
  legal_name text not null,
  trade_name text,
  state_code char(2) references public.states(code),
  source_id uuid not null references public.sources(id),
  external_id text not null,
  source_endpoint text not null,
  imported_at timestamptz not null default now(),
  source_updated_at timestamptz,
  unique (source_id, external_id)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.categories(id),
  code text,
  name text not null,
  category_type text,
  source_id uuid references public.sources(id),
  external_id text,
  unique nulls not distinct (source_id, external_id)
);

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  normalized_name text not null unique,
  display_name text not null
);

create table public.manufacturers (
  id uuid primary key default gen_random_uuid(),
  cnpj char(14),
  normalized_name text not null unique,
  display_name text not null
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  product_type text not null check (product_type in ('material', 'service', 'unknown')),
  normalized_description text not null,
  grouped_name text,
  catmat_code text,
  catser_code text,
  pdm_code text,
  category_id uuid references public.categories(id),
  brand_id uuid references public.brands(id),
  manufacturer_id uuid references public.manufacturers(id),
  match_status public.match_status not null default 'needs_validation',
  match_confidence numeric(5,4) check (match_confidence between 0 and 1),
  created_at timestamptz not null default now()
);

create table public.procurements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  portal_id uuid references public.portals(id),
  control_number text not null,
  process_number text,
  purchase_number text,
  purchase_year integer,
  sequence_number integer,
  modality_code integer,
  modality_name text,
  status_code integer,
  status_name text,
  object_description text not null,
  published_at timestamptz,
  proposal_start_at timestamptz,
  proposal_end_at timestamptz,
  estimated_value numeric(20,4),
  homologated_value numeric(20,4),
  source_id uuid not null references public.sources(id),
  source_endpoint text not null,
  external_id text not null,
  imported_at timestamptz not null default now(),
  source_updated_at timestamptz,
  raw_data jsonb not null default '{}'::jsonb,
  unique (source_id, external_id)
);

create table public.procurement_items (
  id uuid primary key default gen_random_uuid(),
  procurement_id uuid not null references public.procurements(id) on delete cascade,
  product_id uuid references public.products(id),
  item_number integer not null,
  original_description text not null,
  normalized_description text,
  unit text,
  quantity numeric(20,4),
  estimated_unit_value numeric(20,4),
  estimated_total_value numeric(20,4),
  status_name text,
  has_result boolean not null default false,
  catalog_item_code text,
  source_id uuid not null references public.sources(id),
  source_endpoint text not null,
  external_id text not null,
  imported_at timestamptz not null default now(),
  source_updated_at timestamptz,
  raw_data jsonb not null default '{}'::jsonb,
  unique (source_id, external_id)
);

create table public.bids (
  id uuid primary key default gen_random_uuid(),
  procurement_item_id uuid not null references public.procurement_items(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id),
  rank integer,
  unit_value numeric(20,4),
  total_value numeric(20,4),
  status text,
  source_id uuid not null references public.sources(id),
  source_endpoint text not null,
  external_id text not null,
  imported_at timestamptz not null default now(),
  unique (source_id, external_id)
);

create table public.results (
  id uuid primary key default gen_random_uuid(),
  procurement_item_id uuid not null references public.procurement_items(id) on delete cascade,
  supplier_id uuid references public.suppliers(id),
  result_sequence integer,
  quantity_homologated numeric(20,4),
  unit_value numeric(20,4),
  total_value numeric(20,4),
  brand_id uuid references public.brands(id),
  manufacturer_id uuid references public.manufacturers(id),
  winner boolean not null default false,
  source_id uuid not null references public.sources(id),
  source_endpoint text not null,
  external_id text not null,
  imported_at timestamptz not null default now(),
  source_updated_at timestamptz,
  raw_data jsonb not null default '{}'::jsonb,
  unique (source_id, external_id)
);

create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  procurement_id uuid references public.procurements(id),
  supplier_id uuid references public.suppliers(id),
  contract_number text,
  object_description text,
  initial_value numeric(20,4),
  total_value numeric(20,4),
  signed_at date,
  valid_from date,
  valid_until date,
  source_id uuid not null references public.sources(id),
  source_endpoint text not null,
  external_id text not null,
  imported_at timestamptz not null default now(),
  source_updated_at timestamptz,
  unique (source_id, external_id)
);

create table public.price_records (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id),
  procurement_item_id uuid references public.procurement_items(id),
  supplier_id uuid references public.suppliers(id),
  organization_id uuid references public.organizations(id),
  state_code char(2) references public.states(code),
  observed_at date not null,
  unit text,
  quantity numeric(20,4),
  unit_price numeric(20,4) not null,
  source_id uuid not null references public.sources(id),
  source_endpoint text not null,
  external_id text not null,
  imported_at timestamptz not null default now(),
  unique (source_id, external_id)
);

create table public.imports (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources(id),
  endpoint text not null,
  checkpoint jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status public.sync_status not null default 'running',
  processed_count bigint not null default 0,
  inserted_count bigint not null default 0,
  updated_count bigint not null default 0,
  error_count bigint not null default 0
);

create table public.sync_logs (
  id uuid primary key default gen_random_uuid(),
  import_id uuid references public.imports(id) on delete cascade,
  source_id uuid not null references public.sources(id),
  endpoint text not null,
  level text not null check (level in ('info', 'warning', 'error')),
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.favorites (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant_id() references public.tenants(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.users(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  notes text,
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id, entity_type, entity_id)
);

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant_id() references public.tenants(id) on delete cascade,
  procurement_id uuid references public.procurements(id),
  title text not null,
  stage text not null default 'identified',
  score numeric(5,2),
  rationale jsonb not null default '[]'::jsonb,
  statistical_indicator boolean not null default true,
  owner_id uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant_id() references public.tenants(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.users(id) on delete cascade,
  name text not null,
  alert_type text not null,
  filters jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create index procurements_published_idx on public.procurements (published_at desc);
create index procurements_org_idx on public.procurements (organization_id);
create index procurement_items_product_idx on public.procurement_items (product_id);
create index procurement_items_description_trgm_idx on public.procurement_items using gin (normalized_description gin_trgm_ops);
create index companies_cnpj_idx on public.companies (cnpj);
create index suppliers_cnpj_idx on public.suppliers (cnpj_cpf);
create index price_records_product_date_idx on public.price_records (product_id, observed_at desc);
create index opportunities_tenant_idx on public.opportunities (tenant_id, stage);

insert into public.states (code, name, region, ibge_code) values
('AC','Acre','Norte','12'),('AL','Alagoas','Nordeste','27'),('AP','Amapá','Norte','16'),('AM','Amazonas','Norte','13'),('BA','Bahia','Nordeste','29'),('CE','Ceará','Nordeste','23'),('DF','Distrito Federal','Centro-Oeste','53'),('ES','Espírito Santo','Sudeste','32'),('GO','Goiás','Centro-Oeste','52'),('MA','Maranhão','Nordeste','21'),('MT','Mato Grosso','Centro-Oeste','51'),('MS','Mato Grosso do Sul','Centro-Oeste','50'),('MG','Minas Gerais','Sudeste','31'),('PA','Pará','Norte','15'),('PB','Paraíba','Nordeste','25'),('PR','Paraná','Sul','41'),('PE','Pernambuco','Nordeste','26'),('PI','Piauí','Nordeste','22'),('RJ','Rio de Janeiro','Sudeste','33'),('RN','Rio Grande do Norte','Nordeste','24'),('RS','Rio Grande do Sul','Sul','43'),('RO','Rondônia','Norte','11'),('RR','Roraima','Norte','14'),('SC','Santa Catarina','Sul','42'),('SP','São Paulo','Sudeste','35'),('SE','Sergipe','Nordeste','28'),('TO','Tocantins','Norte','17')
on conflict do nothing;

insert into public.sources (code, name, base_url, documentation_url, auth_type, reliability_notes) values
('PNCP','Portal Nacional de Contratações Públicas','https://pncp.gov.br/api/consulta','https://pncp.gov.br/api/consulta/swagger-ui/index.html','none','Fonte oficial; consultas públicas paginadas.'),
('COMPRAS_GOV','Compras.gov.br Dados Abertos','https://dadosabertos.compras.gov.br','https://dadosabertos.compras.gov.br/swagger-ui/index.html','none','Fonte oficial para CATMAT, CATSER, preços e contratações.'),
('BRASIL_API','BrasilAPI','https://brasilapi.com.br/api','https://brasilapi.com.br/docs','none','Agregador público para CNPJ e CEP; sujeito a disponibilidade e limites não garantidos.'),
('SINTEGRA','SintegraWS','https://www.sintegraws.com.br/api/v1/execute-api.php','https://www.sintegraws.com.br/api/sintegra/documentacao','token','Provedor comercial com cobrança por créditos; plugin ST.')
on conflict (code) do update set documentation_url = excluded.documentation_url;

alter table public.tenants enable row level security;
alter table public.users enable row level security;
alter table public.tenant_members enable row level security;
alter table public.companies enable row level security;
alter table public.favorites enable row level security;
alter table public.opportunities enable row level security;
alter table public.alerts enable row level security;

create policy tenants_select_members on public.tenants for select to authenticated using (public.is_tenant_member(id));
create policy users_select_self on public.users for select to authenticated using (id = (select auth.uid()));
create policy users_update_self on public.users for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy tenant_members_select on public.tenant_members for select to authenticated using (public.is_tenant_member(tenant_id));
create policy companies_tenant_all on public.companies for all to authenticated using (tenant_id is not null and public.is_tenant_member(tenant_id)) with check (tenant_id is not null and public.is_tenant_member(tenant_id));
create policy favorites_tenant_all on public.favorites for all to authenticated using (public.is_tenant_member(tenant_id)) with check (public.is_tenant_member(tenant_id));
create policy opportunities_tenant_all on public.opportunities for all to authenticated using (public.is_tenant_member(tenant_id)) with check (public.is_tenant_member(tenant_id));
create policy alerts_tenant_all on public.alerts for all to authenticated using (public.is_tenant_member(tenant_id)) with check (public.is_tenant_member(tenant_id));

do $$ declare table_name text; begin
  foreach table_name in array array['states','cities','sources','portals','organizations','suppliers','categories','brands','manufacturers','products','procurements','procurement_items','bids','results','contracts','price_records'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('create policy %I on public.%I for select to authenticated using (true)', table_name || '_authenticated_read', table_name);
  end loop;
end $$;

revoke all on all tables in schema public from anon;
grant usage on schema public to authenticated;
grant select on public.states, public.cities, public.sources, public.portals, public.organizations, public.suppliers, public.categories, public.brands, public.manufacturers, public.products, public.procurements, public.procurement_items, public.bids, public.results, public.contracts, public.price_records to authenticated;
grant select, insert, update, delete on public.companies, public.favorites, public.opportunities, public.alerts to authenticated;
grant select, update on public.users to authenticated;
grant select on public.tenants, public.tenant_members to authenticated;
