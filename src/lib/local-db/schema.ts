import "server-only";
import { getPool } from "@/lib/local-db/pool";

export interface ForeignKey { table: string; columns: string[]; refTable: string; refColumns: string[] }
export interface FunctionInfo { returnsSet: boolean; composite: boolean; isVoid: boolean }
export interface SchemaInfo {
  columns: Map<string, Map<string, string>>;
  primaryKeys: Map<string, string[]>;
  foreignKeys: ForeignKey[];
  functions: Map<string, FunctionInfo>;
}

let cached: Promise<SchemaInfo> | null = null;

export function getSchema() {
  if (!cached) cached = loadSchema().catch((error) => { cached = null; throw error; });
  return cached;
}

async function loadSchema(): Promise<SchemaInfo> {
  const pool = getPool();
  const [columns, keys, foreign, functions] = await Promise.all([
    pool.query<{ table_name: string; column_name: string; udt_name: string }>(
      "select table_name, column_name, udt_name from information_schema.columns where table_schema = 'public'",
    ),
    pool.query<{ table_name: string; columns: string[] }>(`
      select cl.relname as table_name,
        array(select a.attname::text from unnest(con.conkey) with ordinality k(attnum, ord)
              join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum order by k.ord) as columns
      from pg_constraint con
      join pg_class cl on cl.oid = con.conrelid
      join pg_namespace n on n.oid = cl.relnamespace
      where con.contype = 'p' and n.nspname = 'public'`),
    pool.query<{ table_name: string; columns: string[]; ref_table: string; ref_columns: string[] }>(`
      select cl.relname as table_name, rcl.relname as ref_table,
        array(select a.attname::text from unnest(con.conkey) with ordinality k(attnum, ord)
              join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum order by k.ord) as columns,
        array(select a.attname::text from unnest(con.confkey) with ordinality k(attnum, ord)
              join pg_attribute a on a.attrelid = con.confrelid and a.attnum = k.attnum order by k.ord) as ref_columns
      from pg_constraint con
      join pg_class cl on cl.oid = con.conrelid
      join pg_namespace n on n.oid = cl.relnamespace
      join pg_class rcl on rcl.oid = con.confrelid
      join pg_namespace rn on rn.oid = rcl.relnamespace
      where con.contype = 'f' and n.nspname = 'public' and rn.nspname = 'public'`),
    pool.query<{ proname: string; proretset: boolean; typtype: string; is_void: boolean }>(`
      select p.proname, p.proretset, t.typtype, (p.prorettype = 'void'::regtype) as is_void
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      join pg_type t on t.oid = p.prorettype
      where n.nspname = 'public'`),
  ]);

  const columnMap = new Map<string, Map<string, string>>();
  for (const row of columns.rows) {
    if (!columnMap.has(row.table_name)) columnMap.set(row.table_name, new Map());
    columnMap.get(row.table_name)!.set(row.column_name, row.udt_name);
  }
  return {
    columns: columnMap,
    primaryKeys: new Map(keys.rows.map((row) => [row.table_name, row.columns])),
    foreignKeys: foreign.rows.map((row) => ({ table: row.table_name, columns: row.columns, refTable: row.ref_table, refColumns: row.ref_columns })),
    functions: new Map(functions.rows.map((row) => [row.proname, { returnsSet: row.proretset, composite: row.typtype === "c", isVoid: row.is_void }])),
  };
}
