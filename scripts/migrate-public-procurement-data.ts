import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const sourceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sourceKey = process.env.SUPABASE_SECRET_KEY;
const targetUrl = process.env.MIGRATION_TARGET_URL;
const targetKey = process.env.MIGRATION_TARGET_SERVICE_KEY;

if (!sourceUrl || !sourceKey || !targetUrl || !targetKey) {
  throw new Error("Credenciais de origem ou destino ausentes para a migração.");
}

const source = createClient(sourceUrl, sourceKey, { auth: { persistSession: false } });
const target = createClient(targetUrl, targetKey, { auth: { persistSession: false } });
const pageSize = 250;
const sourceIdMap = new Map<string, string>();

async function copySources() {
  const { data: oldSources, error } = await source.from("sources").select("*");
  if (error) throw error;
  for (const oldSource of oldSources ?? []) {
    const { data: current, error: lookupError } = await target
      .from("sources").select("id").eq("code", oldSource.code).maybeSingle();
    if (lookupError) throw lookupError;
    const targetId = current?.id ?? oldSource.id;
    const { error: upsertError } = await target.from("sources").upsert(
      { ...oldSource, id: targetId },
      { onConflict: "code" },
    );
    if (upsertError) throw upsertError;
    sourceIdMap.set(oldSource.id, targetId);
  }
  return oldSources?.length ?? 0;
}

function prepareRow(table: string, row: Record<string, unknown>) {
  const prepared = { ...row };
  if (table === "procurements") delete prepared.search_document;
  if (typeof prepared.source_id === "string") {
    prepared.source_id = sourceIdMap.get(prepared.source_id) ?? prepared.source_id;
  }
  return prepared;
}

async function copyTable(client: SupabaseClient, table: string) {
  let copied = 0;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await source.from(table).select("*").range(from, from + pageSize - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    const rows = (data ?? []).map((row) => prepareRow(table, row as Record<string, unknown>));
    if (rows.length) {
      const { error: writeError } = await client.from(table).upsert(rows);
      if (writeError) throw new Error(`${table}: ${writeError.message}`);
      copied += rows.length;
    }
    if ((data?.length ?? 0) < pageSize) break;
  }
  return copied;
}

const tables = [
  "states", "cities", "portals", "categories", "brands", "manufacturers",
  "organizations", "suppliers", "products", "procurements", "procurement_sources",
  "procurement_items", "bids", "results", "contracts", "price_records",
];

async function main() {
  const summary: Record<string, number> = { sources: await copySources() };
  for (const table of tables) {
    summary[table] = await copyTable(target, table);
    console.log(`${table}: ${summary[table]}`);
  }

  const { error: analyticsError } = await target.rpc("refresh_market_analytics");
  if (analyticsError) throw analyticsError;
  console.log(JSON.stringify({ migrated: true, summary }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
