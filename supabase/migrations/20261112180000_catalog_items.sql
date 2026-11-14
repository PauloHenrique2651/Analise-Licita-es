-- Catálogo oficial de materiais (CATMAT) e serviços (CATSER) do Compras.gov.br,
-- usado para encontrar o código de um item a partir do nome digitado.

create table if not exists public.catalog_items (
  kind text not null check (kind in ('material', 'servico')),
  code text not null,
  description text not null,
  pdm_code text,
  pdm_name text,
  class_code text,
  class_name text,
  group_name text,
  ncm_code text,
  sustainable boolean,
  active boolean not null default true,
  search_text text not null,
  source_updated_at timestamptz,
  imported_at timestamptz not null default now(),
  primary key (kind, code)
);

create index if not exists catalog_items_search_trgm on public.catalog_items using gin (search_text gin_trgm_ops);
create index if not exists catalog_items_pdm on public.catalog_items (kind, pdm_code);

alter table public.catalog_items enable row level security;

drop policy if exists catalog_items_read on public.catalog_items;
create policy catalog_items_read on public.catalog_items
  for select to anon, authenticated
  using (true);

grant select on public.catalog_items to anon, authenticated;
grant all on public.catalog_items to service_role;

-- Busca por nome: todas as palavras precisam aparecer (sem acento, minúsculas);
-- o ranking favorece itens ativos, maior similaridade e descrições mais curtas.
create or replace function public.search_catalog_items(p_query text, p_kind text default null, p_limit integer default 20)
returns table (
  kind text,
  code text,
  description text,
  pdm_name text,
  class_name text,
  active boolean,
  score real
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with input as (
    select
      lower(translate(trim(coalesce(p_query, '')),
        'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç',
        'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc')) as q
  ),
  words as (
    select array_agg('%' || word || '%') as patterns
    from input, regexp_split_to_table((select q from input), '\s+') as word
    where length(word) >= 2
  )
  select c.kind, c.code, c.description, c.pdm_name, c.class_name, c.active,
         similarity(c.search_text, (select q from input)) as score
  from public.catalog_items c, words w
  where (p_kind is null or c.kind = p_kind)
    and (
      c.code = (select q from input)
      or (w.patterns is not null and c.search_text like all (w.patterns))
    )
  order by (c.code = (select q from input)) desc, c.active desc, score desc, length(c.description) asc
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
$$;

grant execute on function public.search_catalog_items(text, text, integer) to anon, authenticated;
