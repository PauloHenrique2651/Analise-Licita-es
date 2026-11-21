-- Painel de administração: contagens aproximadas (a contagem exata das tabelas grandes levava segundos) e índice dos logs.
create index if not exists sync_logs_created_idx on public.sync_logs (created_at desc);

create or replace function public.table_estimates(p_tables text[])
returns table (table_name text, estimate bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select c.relname::text, greatest(c.reltuples, 0)::bigint
  from pg_catalog.pg_class c
  where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'm') and c.relname = any(p_tables)
$$;
grant execute on function public.table_estimates(text[]) to authenticated;
