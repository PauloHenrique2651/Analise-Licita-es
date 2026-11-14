create or replace function public.has_tenant_role(requested_tenant uuid, allowed_roles public.user_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tenant_members
    where tenant_id = requested_tenant
      and user_id = (select auth.uid())
      and role = any(allowed_roles)
  )
$$;

drop policy if exists users_update_self on public.users;
create policy users_update_self on public.users for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()) and public.is_tenant_member(active_tenant_id));

drop policy if exists companies_tenant_all on public.companies;
create policy companies_tenant_select on public.companies for select to authenticated using (public.is_tenant_member(tenant_id));
create policy companies_tenant_insert on public.companies for insert to authenticated with check (public.has_tenant_role(tenant_id, array['owner','admin','analyst']::public.user_role[]));
create policy companies_tenant_update on public.companies for update to authenticated using (public.has_tenant_role(tenant_id, array['owner','admin','analyst']::public.user_role[])) with check (public.has_tenant_role(tenant_id, array['owner','admin','analyst']::public.user_role[]));
create policy companies_tenant_delete on public.companies for delete to authenticated using (public.has_tenant_role(tenant_id, array['owner','admin']::public.user_role[]));

drop policy if exists favorites_tenant_all on public.favorites;
create policy favorites_owner_all on public.favorites for all to authenticated
  using (tenant_id = public.current_tenant_id() and user_id = (select auth.uid()))
  with check (tenant_id = public.current_tenant_id() and user_id = (select auth.uid()));

drop policy if exists alerts_tenant_all on public.alerts;
create policy alerts_owner_all on public.alerts for all to authenticated
  using (tenant_id = public.current_tenant_id() and user_id = (select auth.uid()))
  with check (tenant_id = public.current_tenant_id() and user_id = (select auth.uid()));

drop policy if exists opportunities_tenant_all on public.opportunities;
create policy opportunities_tenant_select on public.opportunities for select to authenticated using (public.is_tenant_member(tenant_id));
create policy opportunities_tenant_write on public.opportunities for all to authenticated
  using (public.has_tenant_role(tenant_id, array['owner','admin','analyst','sales']::public.user_role[]))
  with check (public.has_tenant_role(tenant_id, array['owner','admin','analyst','sales']::public.user_role[]));

do $$ declare table_name text; begin
  foreach table_name in array array['client_portal_shares','process_events','portal_messages','document_requests','client_documents','audit_logs','fiscal_authorizations','fiscal_certificates','fiscal_documents','fiscal_jobs'] loop
    execute format('drop policy if exists %I on public.%I', table_name || '_tenant_access', table_name);
  end loop;
end $$;

create policy portal_shares_select on public.client_portal_shares for select to authenticated using (public.is_tenant_member(tenant_id));
create policy portal_shares_write on public.client_portal_shares for all to authenticated using (public.has_tenant_role(tenant_id, array['owner','admin','analyst','sales']::public.user_role[])) with check (public.has_tenant_role(tenant_id, array['owner','admin','analyst','sales']::public.user_role[]));

create policy process_events_select on public.process_events for select to authenticated using (public.is_tenant_member(tenant_id));
create policy process_events_write on public.process_events for all to authenticated using (public.has_tenant_role(tenant_id, array['owner','admin','analyst','sales']::public.user_role[])) with check (public.has_tenant_role(tenant_id, array['owner','admin','analyst','sales']::public.user_role[]));

create policy portal_messages_select on public.portal_messages for select to authenticated using (public.is_tenant_member(tenant_id));
create policy portal_messages_insert on public.portal_messages for insert to authenticated with check (public.is_tenant_member(tenant_id));
create policy portal_messages_delete on public.portal_messages for delete to authenticated using (public.has_tenant_role(tenant_id, array['owner','admin']::public.user_role[]));

create policy document_requests_select on public.document_requests for select to authenticated using (public.is_tenant_member(tenant_id));
create policy document_requests_write on public.document_requests for all to authenticated using (public.has_tenant_role(tenant_id, array['owner','admin','analyst','sales']::public.user_role[])) with check (public.has_tenant_role(tenant_id, array['owner','admin','analyst','sales']::public.user_role[]));
create policy client_documents_select on public.client_documents for select to authenticated using (public.is_tenant_member(tenant_id));
create policy client_documents_manage on public.client_documents for all to authenticated using (public.has_tenant_role(tenant_id, array['owner','admin','analyst']::public.user_role[])) with check (public.has_tenant_role(tenant_id, array['owner','admin','analyst']::public.user_role[]));

create policy audit_logs_select on public.audit_logs for select to authenticated using (tenant_id is null or public.has_tenant_role(tenant_id, array['owner','admin']::public.user_role[]));
create policy audit_logs_insert on public.audit_logs for insert to authenticated with check (tenant_id is null or public.is_tenant_member(tenant_id));

create policy fiscal_authorizations_select on public.fiscal_authorizations for select to authenticated using (public.has_tenant_role(tenant_id, array['owner','admin','analyst']::public.user_role[]));
create policy fiscal_authorizations_manage on public.fiscal_authorizations for all to authenticated using (public.has_tenant_role(tenant_id, array['owner','admin']::public.user_role[])) with check (public.has_tenant_role(tenant_id, array['owner','admin']::public.user_role[]));
create policy fiscal_certificates_select on public.fiscal_certificates for select to authenticated using (public.has_tenant_role(tenant_id, array['owner','admin']::public.user_role[]));
create policy fiscal_certificates_manage on public.fiscal_certificates for all to authenticated using (public.has_tenant_role(tenant_id, array['owner','admin']::public.user_role[])) with check (public.has_tenant_role(tenant_id, array['owner','admin']::public.user_role[]));
create policy fiscal_documents_select on public.fiscal_documents for select to authenticated using (public.has_tenant_role(tenant_id, array['owner','admin','analyst']::public.user_role[]));
create policy fiscal_documents_manage on public.fiscal_documents for all to authenticated using (public.has_tenant_role(tenant_id, array['owner','admin']::public.user_role[])) with check (public.has_tenant_role(tenant_id, array['owner','admin']::public.user_role[]));
create policy fiscal_jobs_select on public.fiscal_jobs for select to authenticated using (public.has_tenant_role(tenant_id, array['owner','admin']::public.user_role[]));
