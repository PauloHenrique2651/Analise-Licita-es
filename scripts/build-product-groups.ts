// Agrupa itens equivalentes (descrições diferentes) em produtos, classifica por nicho e atualiza as estatísticas.
// Incremental: só processa itens ainda sem grupo. Uso: node --env-file=... --conditions=react-server --import tsx scripts/build-product-groups.ts [--rebuild]
import { getPool } from "../src/lib/local-db/pool";
import { headKey, nicheFor, type Niche } from "../src/lib/product-grouping";

const BATCH = 4000;
const MERGE_SIMILARITY = 0.75;

interface ItemRow {
  id: string;
  original_description: string;
  mos: string | null;
  code: string | null;
  kind: "material" | "servico" | null;
  pdm_code: string | null;
  pdm_name: string | null;
  cat_description: string | null;
  group_name: string | null;
  class_name: string | null;
}

interface GroupSeed {
  key: string;
  name: string;
  niche: Niche;
  kind: "material" | "servico" | null;
  catalogGroup: string | null;
  catalogClass: string | null;
  pdmCode: string | null;
}

const pool = getPool();
const groupIds = new Map<string, string>();
const touched = new Set<string>();

function cleanName(text: string) {
  const name = text.replace(/\s+/g, " ").trim().slice(0, 90);
  return name === name.toUpperCase() ? name.charAt(0) + name.slice(1).toLowerCase() : name;
}

function seedFor(item: ItemRow): GroupSeed | null {
  const kind = item.kind ?? (item.mos === "S" ? "servico" : item.mos === "M" ? "material" : null);
  if (item.pdm_code && item.pdm_name) {
    const name = cleanName(item.pdm_name);
    return { key: `pdm:${item.pdm_code}`, name, niche: nicheFor(name, item.group_name, kind), kind, catalogGroup: item.group_name, catalogClass: item.class_name, pdmCode: item.pdm_code };
  }
  if (item.code && item.cat_description) {
    const head = headKey(item.cat_description);
    if (head) return { key: `cat:${item.code}`, name: cleanName(head.name), niche: nicheFor(head.name, item.group_name, kind), kind, catalogGroup: item.group_name, catalogClass: item.class_name, pdmCode: null };
  }
  const head = headKey(item.original_description);
  if (!head) return null;
  return { key: `txt:${head.key}`, name: head.name, niche: nicheFor(`${head.name} ${item.original_description.slice(0, 160)}`, null, kind), kind, catalogGroup: null, catalogClass: null, pdmCode: null };
}

async function resolveGroup(seed: GroupSeed): Promise<string> {
  const cached = groupIds.get(seed.key);
  if (cached) return cached;
  const existing = await pool.query<{ id: string }>("select id from public.product_groups where canonical_key = $1", [seed.key]);
  if (existing.rows[0]) { groupIds.set(seed.key, existing.rows[0].id); return existing.rows[0].id; }

  // Produto novo: se já existe um parecido no mesmo nicho (outra grafia, outra ordem de palavras), junta nele
  if (seed.key.startsWith("txt:") || seed.key.startsWith("cat:")) {
    const similar = await pool.query<{ id: string }>(
      `select id from public.product_groups
       where niche = $1 and name operator(public.%) $2 and public.similarity(name, $2) >= $3
       order by (canonical_key like 'pdm:%') desc, public.similarity(name, $2) desc, item_count desc limit 1`,
      [seed.niche, seed.name, MERGE_SIMILARITY],
    );
    if (similar.rows[0]) { groupIds.set(seed.key, similar.rows[0].id); return similar.rows[0].id; }
  }
  const inserted = await pool.query<{ id: string }>(
    `insert into public.product_groups (name, canonical_key, niche, kind, catalog_group, catalog_class, pdm_code, search_text)
     values ($1, $2, $3, $4, $5, $6, $7, public.unaccent(lower($1)))
     on conflict (canonical_key) do update set updated_at = now() returning id`,
    [seed.name, seed.key, seed.niche, seed.kind, seed.catalogGroup, seed.catalogClass, seed.pdmCode],
  );
  groupIds.set(seed.key, inserted.rows[0].id);
  return inserted.rows[0].id;
}

async function ungroupableId() {
  const result = await pool.query<{ id: string }>(
    `insert into public.product_groups (name, canonical_key, niche) values ('Sem descrição identificável', 'none', 'Outros')
     on conflict (canonical_key) do update set updated_at = now() returning id`,
  );
  return result.rows[0].id;
}

async function assignBatch(): Promise<number> {
  const { rows } = await pool.query<ItemRow>(
    `select i.id, i.original_description, i.raw_data->>'materialOuServico' as mos, i.catalog_item_code as code,
            c.kind, c.pdm_code, c.pdm_name, c.description as cat_description, c.group_name, c.class_name
     from public.procurement_items i
     left join public.catalog_items c on c.code = i.catalog_item_code
       and c.kind = case when i.raw_data->>'materialOuServico' = 'S' then 'servico' else 'material' end
     where i.group_id is null
     order by i.id
     limit $1`,
    [BATCH],
  );
  if (!rows.length) return 0;
  const noGroup = await ungroupableId();
  const ids: string[] = [];
  const groups: string[] = [];
  for (const item of rows) {
    const seed = seedFor(item);
    const groupId = seed ? await resolveGroup(seed) : noGroup;
    ids.push(item.id); groups.push(groupId); touched.add(groupId);
  }
  await pool.query(
    `update public.procurement_items i set group_id = v.gid from (select unnest($1::uuid[]) as id, unnest($2::uuid[]) as gid) v where i.id = v.id`,
    [ids, groups],
  );
  return rows.length;
}

async function refreshStats(groupIdList: string[]) {
  for (let offset = 0; offset < groupIdList.length; offset += 500) {
    const ids = groupIdList.slice(offset, offset + 500);
    await pool.query(
      `with s as (
         select i.group_id, count(*)::int as n, count(distinct i.procurement_id)::int as p,
                count(distinct left(lower(i.original_description), 60))::int as v, max(p.published_at) as last_seen,
                mode() within group (order by public.normalize_unit(i.unit)) as unit
         from public.procurement_items i join public.procurements p on p.id = i.procurement_id
         where i.group_id = any($1) group by i.group_id)
       update public.product_groups g set item_count = s.n, procurement_count = s.p, description_variants = s.v,
              last_seen_at = s.last_seen, unit = s.unit, updated_at = now()
       from s where g.id = s.group_id`,
      [ids],
    );
    // Faixa de preço (percentis 10, 50 e 90: descarta erros de digitação) só com a unidade mais frequente do produto
    await pool.query(
      `with pr as (
         select i.group_id,
                percentile_cont(0.1) within group (order by i.estimated_unit_value) as lo,
                percentile_cont(0.5) within group (order by i.estimated_unit_value) as mid,
                percentile_cont(0.9) within group (order by i.estimated_unit_value) as hi
         from public.procurement_items i join public.product_groups g on g.id = i.group_id
         where i.group_id = any($1) and i.estimated_unit_value > 0 and public.normalize_unit(i.unit) is not distinct from g.unit
         group by i.group_id)
       update public.product_groups g set min_unit_value = pr.lo, median_unit_value = pr.mid, max_unit_value = pr.hi
       from pr where g.id = pr.group_id`,
      [ids],
    );
    await pool.query("delete from public.product_group_states where group_id = any($1)", [ids]);
    await pool.query(
      `insert into public.product_group_states (group_id, state_code, procurement_count, item_count)
       select i.group_id, p.state_code, count(distinct i.procurement_id), count(*)
       from public.procurement_items i join public.procurements p on p.id = i.procurement_id
       where i.group_id = any($1) and p.state_code is not null group by i.group_id, p.state_code`,
      [ids],
    );
    await pool.query(
      `update public.product_groups g set search_text = left(public.unaccent(lower(g.name || ' ' || coalesce(v.txt, ''))), 900)
       from (select gg.id, (select string_agg(d, ' ') from (select distinct left(original_description, 80) as d from public.procurement_items
                            where group_id = gg.id limit 12) x) as txt
             from public.product_groups gg where gg.id = any($1)) v
       where g.id = v.id`,
      [ids],
    );
  }
}

async function main() {
  const started = Date.now();
  if (process.argv.includes("--rebuild")) {
    await pool.query("update public.procurement_items set group_id = null where group_id is not null");
    await pool.query("delete from public.product_groups");
    console.log("rebuild: grupos apagados");
  }
  let total = 0;
  for (;;) {
    const n = await assignBatch();
    if (!n) break;
    total += n;
    if (total % (BATCH * 5) < BATCH) console.log(`itens agrupados: ${total}, grupos tocados: ${touched.size}`);
  }
  // Grupos que perderam todos os itens (regras mudaram) ficam zerados e somem das listas
  await pool.query("update public.product_groups set item_count = 0, procurement_count = 0 where id not in (select distinct group_id from public.procurement_items where group_id is not null)");
  await refreshStats([...touched]);
  const { rows } = await pool.query<{ groups: string; items: string }>("select count(*) filter (where item_count > 0) as groups, coalesce(sum(item_count), 0) as items from public.product_groups");
  console.log(JSON.stringify({ novosItens: total, gruposAtualizados: touched.size, gruposTotal: Number(rows[0].groups), itensAgrupados: Number(rows[0].items), segundos: Math.round((Date.now() - started) / 1000) }));
  await pool.end();
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
