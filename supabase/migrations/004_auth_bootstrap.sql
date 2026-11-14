create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  tenant_uuid uuid;
  base_slug text;
begin
  base_slug := 'workspace-' || substring(replace(new.id::text, '-', '') from 1 for 12);

  insert into public.tenants (name, slug)
  values (
    coalesce(nullif(new.raw_user_meta_data ->> 'company_name', ''), 'Minha empresa'),
    base_slug
  )
  returning id into tenant_uuid;

  insert into public.users (id, email, display_name, active_tenant_id)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(coalesce(new.email, ''), '@', 1)),
    tenant_uuid
  );

  insert into public.tenant_members (tenant_id, user_id, role)
  values (tenant_uuid, new.id, 'owner');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user();

comment on function public.handle_new_auth_user() is
  'Creates the initial tenant, application profile, and owner membership for each new auth user.';
