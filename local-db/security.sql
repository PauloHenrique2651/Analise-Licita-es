-- Endurecimento de permissões. Executado por `scripts/local-db-setup.ts` DEPOIS de todas as migrações, a cada deploy
-- (idempotente), para que nenhuma migração ou concessão automática reabra acesso.
-- Princípio: visitante (anon) não lê nem grava tabela nenhuma; usuário logado (authenticated) passa pelo RLS e só
-- executa as funções que o app usa; a coleta (service_role) tem acesso total.

-- 1. Visitante sem login: nenhuma tabela, view, sequência ou função (exceto o portal público por token, abaixo)
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from public, anon;

-- 2. Ninguém além do dono esvazia tabelas (TRUNCATE não passa pelo RLS) ou cria gatilhos/referências
revoke truncate, references, trigger on all tables in schema public from authenticated, service_role;

-- 3. Funções liberadas para usuários logados: as que o app chama + as usadas pelo RLS + operadores da busca
do $$
declare fn record;
begin
  for fn in
    select p.oid::regprocedure as signature from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in (
        'search_procurements', 'get_daily_opportunity_panel', 'search_catalog_items', 'procurements_by_city',
        'search_product_groups', 'product_group_niches', 'product_group_procurements', 'product_group_variants', 'product_group_suppliers', 'product_group_winning_prices', 'product_price_position', 'product_clients_position', 'supplier_product_groups', 'get_product_group',
        'current_tenant_id', 'is_tenant_member', 'has_tenant_role',
        'similarity', 'similarity_op', 'similarity_dist', 'word_similarity', 'word_similarity_op',
        'word_similarity_commutator_op', 'strict_word_similarity', 'strict_word_similarity_op',
        'strict_word_similarity_commutator_op', 'unaccent', 'gen_random_uuid', 'normalize_unit'
      )
  loop
    execute format('grant execute on function %s to authenticated', fn.signature);
  end loop;

  -- Portal público (acesso por token, sem login): só as duas funções de DTO reduzido
  for fn in
    select p.oid::regprocedure as signature from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname in ('get_public_portal_snapshot', 'send_public_portal_message')
  loop
    execute format('grant execute on function %s to anon, authenticated', fn.signature);
  end loop;
end $$;

-- 4. Coleta e tarefas administrativas
grant execute on all functions in schema public to service_role;

-- 5. Perfil: o usuário só altera nome de exibição e empresa ativa (o RLS ainda exige ser membro da empresa)
revoke update on public.users from authenticated;
grant update (display_name, active_tenant_id, updated_at) on public.users to authenticated;

-- 6. Catálogo só para quem está logado
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'catalog_items' and policyname = 'catalog_items_read') then
    alter policy catalog_items_read on public.catalog_items to authenticated;
  end if;
end $$;

-- 7. Objetos criados no futuro também nascem fechados para o visitante
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon;
alter default privileges revoke execute on functions from public;
