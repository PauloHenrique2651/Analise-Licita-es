import "server-only";
import { getRjSigaItemsSnapshot, streamRjSigaItems } from "@/integrations/procurement/rj-siga/client";
import { normalizeDescription } from "@/integrations/procurement/normalize";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

const SOURCE_CODE = "RJ_DADOS_ABERTOS_SIGA";
const STATE_PROVIDER = "RJ_DADOS_ABERTOS_SIGA_ITEMS";
const UPSERT_BATCH_SIZE = 200;

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return "Falha desconhecida na carga de itens RJ/SIGA.";
}

export async function syncRjSigaItems({ force = false }: { force?: boolean } = {}) {
  const client = createAdminClient();
  const { data: source, error: sourceError } = await client.from("sources").select("id").eq("code", SOURCE_CODE).single();
  if (sourceError || !source) throw sourceError ?? new Error("Fonte RJ/SIGA não cadastrada.");
  const snapshot = await getRjSigaItemsSnapshot();
  const { data: previous } = await client.from("procurement_sync_state").select("metadata").eq("provider", STATE_PROVIDER).maybeSingle();
  const previousSnapshot = (previous?.metadata as { snapshot?: typeof snapshot } | null)?.snapshot;
  const unchanged = !force && previousSnapshot && ((snapshot.etag && snapshot.etag === previousSnapshot.etag) || (snapshot.lastModified && snapshot.lastModified === previousSnapshot.lastModified && snapshot.contentLength === previousSnapshot.contentLength));
  const now = new Date().toISOString();
  await client.from("procurement_sync_state").upsert({ provider: STATE_PROVIDER, last_sync_at: now, last_error: null, metadata: { snapshot, phase: "checking" }, updated_at: now }, { onConflict: "provider" });
  if (unchanged) {
    await client.from("procurement_sync_state").update({ last_success_at: now, consecutive_failures: 0, metadata: { snapshot, skipped: true, reason: "source_not_modified" }, updated_at: now }).eq("provider", STATE_PROVIDER);
    return { provider: STATE_PROVIDER, status: "succeeded" as const, skipped: true, scanned: 0, saved: 0, errors: 0 };
  }

  const procurementIds = new Map<string, string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client.from("procurement_sources").select("external_id,procurement_id").eq("source_id", source.id).eq("is_primary", true).range(from, from + 999);
    if (error) throw error;
    for (const row of data ?? []) procurementIds.set(row.external_id, row.procurement_id);
    if ((data?.length ?? 0) < 1000) break;
  }

  const { data: importRun, error: importError } = await client.from("imports").insert({ source_id: source.id, endpoint: env.RJ_SIGA_ITEMS_URL, checkpoint: { snapshot, targetProcurements: procurementIds.size } }).select("id").single();
  if (importError || !importRun) throw importError ?? new Error("Falha ao iniciar importação dos itens RJ/SIGA.");
  const importId = importRun.id;
  const buffer: Array<Record<string, unknown>> = [];
  let scanned = 0;
  let saved = 0;
  let errors = 0;

  async function flush() {
    if (!buffer.length) return;
    const pendingRows = buffer.splice(0, buffer.length);
    const rows = Array.from(
      new Map(
        pendingRows.map((row) => [`${String(row.procurement_id)}:${String(row.item_number)}`, row]),
      ).values(),
    );
    const { error } = await client.from("procurement_items").upsert(rows, { onConflict: "procurement_id,item_number" });
    if (error) {
      errors += 1;
      throw error;
    }
    saved += rows.length;
    await client.from("imports").update({ processed_count: scanned, inserted_count: saved, error_count: errors, checkpoint: { snapshot, scanned, saved, targetProcurements: procurementIds.size } }).eq("id", importId);
  }

  try {
    for await (const { procurementExternalId, item } of streamRjSigaItems()) {
      scanned += 1;
      const procurementId = procurementIds.get(procurementExternalId);
      if (!procurementId || item.itemNumber === undefined) continue;
      buffer.push({
        procurement_id: procurementId, product_id: null, item_number: item.itemNumber,
        original_description: item.description, normalized_description: normalizeDescription(item.description),
        unit: item.unit ?? null, quantity: item.quantity ?? null,
        estimated_unit_value: item.estimatedUnitValue ?? null, estimated_total_value: item.estimatedTotalValue ?? null,
        homologated_total_value: item.homologatedTotalValue ?? null,
        status_name: item.status ?? null, has_result: item.homologatedTotalValue !== undefined,
        catalog_item_code: item.materialCode ?? item.serviceCode ?? null, source_id: source.id,
        source_endpoint: env.RJ_SIGA_ITEMS_URL, external_id: item.externalId,
        imported_at: new Date().toISOString(), raw_data: item.rawData,
      });
      if (buffer.length >= UPSERT_BATCH_SIZE) await flush();
    }
    await flush();
    const metadata = { snapshot, scanned, saved, errors, targetProcurements: procurementIds.size };
    await client.from("imports").update({ finished_at: new Date().toISOString(), status: errors ? "partial" : "succeeded", processed_count: scanned, inserted_count: saved, error_count: errors, checkpoint: metadata }).eq("id", importId);
    await client.from("procurement_sync_state").update({ last_success_at: new Date().toISOString(), last_error: null, consecutive_failures: 0, metadata, updated_at: new Date().toISOString() }).eq("provider", STATE_PROVIDER);
    await client.rpc("refresh_procurement_item_search", { p_source_code: SOURCE_CODE });
    await client.rpc("refresh_market_analytics");
    return { provider: STATE_PROVIDER, status: errors ? "partial" as const : "succeeded" as const, skipped: false, scanned, saved, errors };
  } catch (error) {
    const errorText = getErrorMessage(error);
    await client.from("imports").update({ finished_at: new Date().toISOString(), status: "failed", processed_count: scanned, inserted_count: saved, error_count: errors + 1 }).eq("id", importId);
    await client.from("sync_logs").insert({ import_id: importId, source_id: source.id, endpoint: env.RJ_SIGA_ITEMS_URL, level: "error", message: errorText.slice(0, 500), metadata: { snapshot, scanned, saved } });
    await client.from("procurement_sync_state").update({ last_error: errorText.slice(0, 500), metadata: { snapshot, scanned, saved }, updated_at: new Date().toISOString() }).eq("provider", STATE_PROVIDER);
    return { provider: STATE_PROVIDER, status: "failed" as const, skipped: false, scanned, saved, errors: errors + 1, message: errorText };
  }
}
