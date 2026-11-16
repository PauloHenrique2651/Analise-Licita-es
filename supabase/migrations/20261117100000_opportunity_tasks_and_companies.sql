-- Checklist padrão por fase em cada negócio + empresa (CNPJ) em cada negócio.
-- Ao enviar uma licitação para "meus negócios", o negócio nasce com as tarefas de todas as fases, e as com prazo
-- recebem a data calculada pela licitação ("agendada pelo modelo").

-- ===== Empresa no negócio =====
alter table public.opportunities add column if not exists company_id uuid references public.companies(id) on delete set null;
create index if not exists opportunities_company_idx on public.opportunities (tenant_id, company_id);

-- A empresa precisa ser da mesma conta: a chave estrangeira sozinha aceitaria o id de outra conta.
create or replace function public.opportunities_company_same_tenant()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.company_id is not null and not exists (
    select 1 from public.companies c where c.id = new.company_id and c.tenant_id = new.tenant_id
  ) then
    raise exception 'Empresa não pertence a esta conta.' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists opportunities_company_same_tenant on public.opportunities;
create trigger opportunities_company_same_tenant
  before insert or update of company_id, tenant_id on public.opportunities
  for each row execute function public.opportunities_company_same_tenant();

-- ===== Modelo de checklist =====
create table if not exists public.checklist_template_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,    -- null = modelo padrão do sistema
  stage text not null check (stage in ('identified', 'qualified', 'proposal', 'submitted', 'won', 'lost')),
  stage_order integer not null,
  position integer not null,
  title text not null check (char_length(title) between 2 and 240),
  due_rule text check (due_rule in ('today', 'opening', 'opening_plus_7')),
  created_at timestamptz not null default now(),
  unique nulls not distinct (tenant_id, stage, position)
);

alter table public.checklist_template_items enable row level security;
drop policy if exists checklist_template_read on public.checklist_template_items;
create policy checklist_template_read on public.checklist_template_items for select to authenticated
  using (tenant_id is null or public.is_tenant_member(tenant_id));
drop policy if exists checklist_template_write on public.checklist_template_items;
create policy checklist_template_write on public.checklist_template_items for all to authenticated
  using (tenant_id is not null and public.has_tenant_role(tenant_id, array['owner', 'admin']::public.user_role[]))
  with check (tenant_id is not null and public.has_tenant_role(tenant_id, array['owner', 'admin']::public.user_role[]));

insert into public.checklist_template_items (tenant_id, stage, stage_order, position, title, due_rule) values
  (null, 'identified', 1, 1, 'Analisar o edital', null),
  (null, 'identified', 1, 2, 'Providenciar documentação de habilitação/qualificação', null),
  (null, 'identified', 1, 3, 'Solicitar esclarecimentos/Impugnar edital', 'today'),
  (null, 'qualified', 2, 1, 'Analisar mercado', null),
  (null, 'qualified', 2, 2, 'Analisar concorrentes', null),
  (null, 'qualified', 2, 3, 'Definir o melhor produto/serviço para a disputa', null),
  (null, 'proposal', 3, 1, 'Cadastrar proposta no portal', null),
  (null, 'proposal', 3, 2, 'Fazer composição de preços para a disputa', null),
  (null, 'proposal', 3, 3, 'Definir a estratégia de preços para a disputa', null),
  (null, 'proposal', 3, 4, 'Participar da disputa', 'opening'),
  (null, 'submitted', 4, 1, 'Analisar documentação dos concorrentes', null),
  (null, 'submitted', 4, 2, 'Analisar produto dos concorrentes', null),
  (null, 'submitted', 4, 3, 'Enviar recurso/contrarrazão', 'opening_plus_7'),
  (null, 'submitted', 4, 4, 'Enviar proposta atualizada', null),
  (null, 'won', 5, 1, 'Assinar contrato', null)
on conflict do nothing;

-- ===== Aplica o checklist a um negócio (só se ele ainda não tem tarefas) =====
create or replace function public.apply_default_checklist(p_opportunity_id uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_procurement uuid;
  v_opening timestamptz;
  v_custom boolean;
  v_count integer;
begin
  -- O RLS só deixa enxergar negócios da própria conta: se não achar, não existe para este usuário.
  select o.tenant_id, o.procurement_id into v_tenant, v_procurement from public.opportunities o where o.id = p_opportunity_id;
  if v_tenant is null then return 0; end if;
  if exists (select 1 from public.process_events e where e.opportunity_id = p_opportunity_id and e.event_type = 'checklist_item') then return 0; end if;

  select coalesce(p.opening_at, p.proposal_end_at) into v_opening from public.procurements p where p.id = v_procurement;
  select exists (select 1 from public.checklist_template_items t where t.tenant_id = v_tenant) into v_custom;

  insert into public.process_events (tenant_id, opportunity_id, event_type, title, visibility, metadata)
  select v_tenant, p_opportunity_id, 'checklist_item', t.title, 'internal',
         jsonb_build_object(
           'completed', false, 'stage', t.stage, 'position', t.position, 'scheduled', t.due_rule is not null,
           'due_at', case t.due_rule
             when 'today' then ((date_trunc('day', now() at time zone 'America/Sao_Paulo') + interval '23 hours 59 minutes') at time zone 'America/Sao_Paulo')
             when 'opening' then v_opening
             when 'opening_plus_7' then v_opening + interval '7 days'
           end)
  from public.checklist_template_items t
  where t.tenant_id is not distinct from (case when v_custom then v_tenant else null end)
  order by t.stage_order, t.position;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ===== Cria o negócio já com as tarefas =====
create or replace function public.create_opportunity(p_procurement_id uuid, p_title text, p_company_id uuid default null)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.opportunities (procurement_id, title, stage, statistical_indicator, company_id)
  values (p_procurement_id, left(coalesce(nullif(trim(p_title), ''), 'Oportunidade sem título'), 300), 'identified', true, p_company_id)
  returning id into v_id;
  perform public.apply_default_checklist(v_id);
  return v_id;
end;
$$;

revoke all on function public.apply_default_checklist(uuid) from public, anon;
revoke all on function public.create_opportunity(uuid, text, uuid) from public, anon;
grant execute on function public.apply_default_checklist(uuid) to authenticated;
grant execute on function public.create_opportunity(uuid, text, uuid) to authenticated;
