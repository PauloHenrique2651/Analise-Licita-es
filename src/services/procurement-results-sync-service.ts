import "server-only";
import { comprasGovConnector, fetchComprasGovResultPage } from "@/integrations/procurement/compras-gov/connector";
import type { NormalizedProcurementResult } from "@/integrations/procurement/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { ProcurementRepository } from "@/repositories/procurement-repository";
import { refreshProcurementAnalytics } from "@/services/procurement-sync-service";

const RESULTS_ENDPOINT = "https://dadosabertos.compras.gov.br/modulo-contratacoes/3_consultarResultadoItensContratacoes_PNCP_14133";

export type ProcurementResultsSyncInput = {
  startDate: string;
  endDate: string;
  startPage?: number;
  maxPages?: number;
  pageSize?: number;
  hydrateMissingLimit?: number;
  stateKey?: string;
  refreshAnalytics?: boolean;
  pageDelayMs?: number;
};

function message(error: unknown) {
  return error instanceof Error ? error.message : "Falha desconhecida";
}

export async function syncProcurementResults(input: ProcurementResultsSyncInput) {
  const client = createAdminClient();
  const repository = new ProcurementRepository(client);
  const source = await repository.getSource("COMPRAS_GOV");
  const stateKey = input.stateKey ?? "COMPRAS_GOV_RESULTS";
  const startPage = Math.max(input.startPage ?? 1, 1);
  const maxPages = Math.max(1, Math.min(input.maxPages ?? 4, 25));
  const pageSize = Math.max(10, Math.min(input.pageSize ?? 250, 500));
  const hydrateMissingLimit = Math.max(0, Math.min(input.hydrateMissingLimit ?? 40, 200));
  const metadata = { startDate: input.startDate, endDate: input.endDate, startPage, pageSize };
  await repository.markSyncStarted(stateKey, metadata);
  const { data: run, error: runError } = await client.from("imports").insert({
    source_id: source.id,
    endpoint: RESULTS_ENDPOINT,
    checkpoint: metadata,
  }).select("id").single();
  if (runError || !run) throw runError ?? new Error("Falha ao iniciar sincronização de resultados.");

  let page = startPage;
  let totalPages = page;
  let pages = 0;
  let discovered = 0;
  let inserted = 0;
  let updated = 0;
  let deferred = 0;
  let errors = 0;
  let hydrated = 0;
  try {
    while (page <= totalPages && pages < maxPages) {
      const resultPage = await fetchComprasGovResultPage({
        startDate: input.startDate,
        endDate: input.endDate,
        page,
        pageSize,
      });
      totalPages = Math.max(resultPage.totalPages, 1);
      pages += 1;
      discovered += resultPage.records.length;

      const grouped = new Map<string, NormalizedProcurementResult[]>();
      let capacityDeferred = false;
      for (const result of resultPage.records) {
        const group = grouped.get(result.pncpId) ?? [];
        group.push(result);
        grouped.set(result.pncpId, group);
      }
      for (const pncpId of grouped.keys()) {
        if (await repository.hasProcurement(pncpId)) continue;
        if (hydrated >= hydrateMissingLimit) { capacityDeferred = true; continue; }
        try {
          const procurement = await comprasGovConnector.fetchProcurementById?.(pncpId);
          if (!procurement) continue;
          procurement.items = await comprasGovConnector.fetchItems?.(procurement) ?? [];
          await repository.save(procurement);
          hydrated += 1;
        } catch (error) {
          errors += 1;
          await client.from("sync_logs").insert({
            import_id: run.id,
            source_id: source.id,
            endpoint: RESULTS_ENDPOINT,
            level: "warning",
            message: message(error).slice(0, 500),
            metadata: { pncpId, phase: "hydrate-parent" },
          });
        }
      }

      const persisted = await repository.saveResults("COMPRAS_GOV", resultPage.records);
      inserted += persisted.inserted;
      updated += persisted.updated;
      deferred += persisted.deferred;
      const nextPage = capacityDeferred ? page : page + 1;
      const truncated = nextPage <= totalPages;
      const progress = { ...metadata, page, totalPages, nextPage: truncated ? nextPage : 1, discovered, inserted, updated, deferred, errors, hydrated };
      await repository.markSyncProgress(stateKey, page, `${input.endDate}:${page}`, progress);
      await client.from("imports").update({
        checkpoint: progress,
        processed_count: discovered,
        inserted_count: inserted,
        updated_count: updated,
        error_count: errors + deferred,
      }).eq("id", run.id);
      page = nextPage;
      if (capacityDeferred) break;
      if (page <= totalPages && pages < maxPages && (input.pageDelayMs ?? 0) > 0) {
        await new Promise((resolve) => setTimeout(resolve, input.pageDelayMs));
      }
    }

    const truncated = page <= totalPages;
    const status = errors > 0 || deferred > 0 ? "partial" : "succeeded";
    const finalMetadata = { ...metadata, page: page - 1, totalPages, nextPage: truncated ? page : 1, truncated, discovered, inserted, updated, deferred, errors, hydrated };
    await client.from("imports").update({
      finished_at: new Date().toISOString(), status, processed_count: discovered,
      inserted_count: inserted, updated_count: updated, error_count: errors + deferred,
      checkpoint: finalMetadata,
    }).eq("id", run.id);
    await repository.markSyncSucceeded(stateKey, finalMetadata);
    if (input.refreshAnalytics !== false && inserted + updated > 0) await refreshProcurementAnalytics();
    return { status, pages, totalPages, nextPage: truncated ? page : 1, truncated, discovered, inserted, updated, deferred, errors, hydrated };
  } catch (error) {
    errors += 1;
    const finalMetadata = { ...metadata, page, totalPages, discovered, inserted, updated, deferred, errors, hydrated };
    await client.from("imports").update({
      finished_at: new Date().toISOString(), status: "failed", processed_count: discovered,
      inserted_count: inserted, updated_count: updated, error_count: errors + deferred,
      checkpoint: finalMetadata,
    }).eq("id", run.id);
    await client.from("sync_logs").insert({
      import_id: run.id, source_id: source.id, endpoint: RESULTS_ENDPOINT,
      level: "error", message: message(error).slice(0, 500), metadata: finalMetadata,
    });
    await repository.markSyncFailed(stateKey, error, finalMetadata);
    return { status: "failed" as const, pages, totalPages, nextPage: page, truncated: true, discovered, inserted, updated, deferred, errors, hydrated, message: message(error) };
  }
}
