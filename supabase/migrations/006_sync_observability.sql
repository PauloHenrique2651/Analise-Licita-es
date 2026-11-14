alter table public.imports enable row level security;
alter table public.sync_logs enable row level security;

create policy imports_authenticated_read on public.imports
  for select to authenticated using (true);
create policy sync_logs_authenticated_read on public.sync_logs
  for select to authenticated using (true);

grant select on public.imports, public.sync_logs to authenticated;

alter publication supabase_realtime add table public.imports;
alter publication supabase_realtime add table public.sync_logs;
