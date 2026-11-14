create type public.portal_sender_type as enum ('tenant_user', 'client');
create type public.document_request_status as enum ('requested', 'uploaded', 'accepted', 'rejected');
create type public.fiscal_environment as enum ('homologation', 'production');
create type public.fiscal_document_status as enum ('draft', 'queued', 'processing', 'authorized', 'rejected', 'cancelled', 'failed');

create table public.client_portal_shares (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant_id() references public.tenants(id) on delete cascade,
  procurement_id uuid references public.procurements(id),
  opportunity_id uuid references public.opportunities(id) on delete cascade,
  token_hash char(64) not null unique,
  client_name text not null,
  client_email text,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_accessed_at timestamptz,
  created_by uuid not null default auth.uid() references public.users(id),
  created_at timestamptz not null default now(),
  check (procurement_id is not null or opportunity_id is not null)
);

create table public.process_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant_id() references public.tenants(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  event_type text not null,
  title text not null,
  description text,
  visibility text not null default 'internal' check (visibility in ('internal', 'client')),
  actor_user_id uuid references public.users(id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.portal_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  share_id uuid not null references public.client_portal_shares(id) on delete cascade,
  sender_type public.portal_sender_type not null,
  sender_user_id uuid references public.users(id),
  sender_name text not null,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);

create table public.document_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant_id() references public.tenants(id) on delete cascade,
  share_id uuid not null references public.client_portal_shares(id) on delete cascade,
  title text not null,
  description text,
  allowed_mime_types text[] not null default array['application/pdf'],
  max_size_bytes bigint not null default 10485760 check (max_size_bytes between 1 and 26214400),
  status public.document_request_status not null default 'requested',
  due_at timestamptz,
  requested_by uuid not null default auth.uid() references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.client_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  request_id uuid not null references public.document_requests(id) on delete cascade,
  storage_path text not null,
  original_filename text not null,
  mime_type text not null,
  size_bytes bigint not null,
  sha256 char(64) not null,
  uploaded_by_name text not null,
  uploaded_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  actor_user_id uuid references public.users(id),
  actor_type text not null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  request_id text,
  ip_hash char(64),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.fiscal_authorizations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant_id() references public.tenants(id) on delete cascade,
  principal_company_id uuid not null references public.companies(id) on delete cascade,
  authorized_by_name text not null,
  authorization_document_path text,
  scopes text[] not null default array['nfe_issue'],
  valid_from timestamptz not null,
  valid_until timestamptz not null,
  revoked_at timestamptz,
  created_by uuid not null default auth.uid() references public.users(id),
  created_at timestamptz not null default now()
);

create table public.fiscal_certificates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant_id() references public.tenants(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  authorization_id uuid references public.fiscal_authorizations(id),
  certificate_type text not null check (certificate_type = 'A1'),
  subject_cnpj char(14) not null,
  fingerprint_sha256 char(64) not null,
  external_vault_ref text not null,
  expires_at timestamptz not null,
  status text not null default 'active' check (status in ('pending', 'active', 'expired', 'revoked')),
  created_by uuid not null default auth.uid() references public.users(id),
  created_at timestamptz not null default now(),
  unique (tenant_id, fingerprint_sha256)
);

comment on column public.fiscal_certificates.external_vault_ref is 'Referência opaca ao cofre externo. Nunca armazene PFX ou senha nesta tabela.';

create table public.fiscal_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant_id() references public.tenants(id) on delete cascade,
  issuer_company_id uuid not null references public.companies(id),
  certificate_id uuid not null references public.fiscal_certificates(id),
  authorization_id uuid references public.fiscal_authorizations(id),
  environment public.fiscal_environment not null default 'homologation',
  document_type text not null check (document_type in ('nfe', 'nfce', 'nfse')),
  status public.fiscal_document_status not null default 'draft',
  access_key char(44),
  sefaz_protocol text,
  rejection_code text,
  rejection_reason text,
  xml_storage_path text,
  danfe_storage_path text,
  request_payload jsonb not null default '{}'::jsonb,
  issued_at timestamptz,
  created_by uuid not null default auth.uid() references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.fiscal_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  fiscal_document_id uuid not null references public.fiscal_documents(id) on delete cascade,
  operation text not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  finished_at timestamptz,
  safe_error_message text,
  created_at timestamptz not null default now()
);

create index portal_shares_tenant_idx on public.client_portal_shares (tenant_id, expires_at desc);
create index portal_messages_share_idx on public.portal_messages (share_id, created_at);
create index document_requests_share_idx on public.document_requests (share_id, status);
create index process_events_opportunity_idx on public.process_events (opportunity_id, created_at desc);
create index fiscal_documents_tenant_idx on public.fiscal_documents (tenant_id, created_at desc);
create index fiscal_jobs_queue_idx on public.fiscal_jobs (status, available_at) where status = 'queued';

do $$ declare table_name text; begin
  foreach table_name in array array['client_portal_shares','process_events','portal_messages','document_requests','client_documents','audit_logs','fiscal_authorizations','fiscal_certificates','fiscal_documents','fiscal_jobs'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_tenant_member(tenant_id)) with check (public.is_tenant_member(tenant_id))', table_name || '_tenant_access', table_name);
    execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
  end loop;
end $$;

revoke all on public.client_portal_shares, public.process_events, public.portal_messages, public.document_requests, public.client_documents, public.audit_logs, public.fiscal_authorizations, public.fiscal_certificates, public.fiscal_documents, public.fiscal_jobs from anon;

alter publication supabase_realtime add table public.portal_messages;
alter publication supabase_realtime add table public.process_events;
alter publication supabase_realtime add table public.document_requests;
