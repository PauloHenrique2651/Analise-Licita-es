import "server-only";
import { comprasGovConnector } from "@/integrations/procurement/compras-gov/connector";
import { pncpConnector } from "@/integrations/procurement/pncp/connector";
import type { NormalizedProcurementResult, ProcurementApiProviderSlug, ProcurementProvider, ProviderSlug } from "@/integrations/procurement/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { ProcurementRepository } from "@/repositories/procurement-repository";

const connectors: Record<ProcurementApiProviderSlug, ProcurementProvider> = {
  PNCP: pncpConnector,
  COMPRAS_GOV: comprasGovConnector,
};

export type ProcurementSyncInput = {
  startDate: string;
  endDate: string;
  modalityCode: number;
  providers?: ProcurementApiProviderSlug[];
  maxPages?: number;
  startPage?: number;
  pageSize?: number;
  withItems?: boolean;
  /** Modo espelho: pula licitações já gravadas que não mudaram na fonte (evita rebuscar itens a cada ciclo). */
  skipUnchanged?: boolean;
  state?: string;
  cityIbgeCode?: string;
  refreshAnalytics?: boolean;
  pageDelayMs?: number;
};

export type ProviderSyncResult = {
  provider: ProviderSlug;
  status: "succeeded" | "partial" | "failed";
  processed: number;
  inserted: number;
  updated: number;
  errors: number;
  pages: number;
  truncated?: boolean;
  nextPage?: number;
  message?: string;
};

function providerEndpoint(provider: ProviderSlug) {
  return provider === "PNCP"
    ? "https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao"
    : "https://dadosabertos.compras.gov.br/modulo-contratacoes/1_consultarContratacoes_PNCP_14133";
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return fallback;
}

async function syncProvider(provider: ProcurementProvider, input: ProcurementSyncInput): Promise<ProviderSyncResult> {
  const client = createAdminClient();
  const repository = new ProcurementRepository(client);
  const source = await repository.getSource(provider.slug);
  const endpoint = providerEndpoint(provider.slug);
  const metadata = { startDate: input.startDate, endDate: input.endDate, modalityCode: input.modalityCode, state: input.state ?? null, cityIbgeCode: input.cityIbgeCode ?? null };
  await repository.markSyncStarted(provider.slug, metadata);

  const { data: importRun, error: importError } = await client.from("imports").insert({
    source_id: source.id,
    endpoint,
    checkpoint: { page: 0, ...metadata },
  }).select("id").single();
  if (importError || !importRun) throw importError ?? new Error(`Falha ao iniciar importação ${provider.slug}.`);
  const importId = importRun.id;

  let page = Math.max(input.startPage ?? 1, 1);
  let totalPages = page;
  let pagesProcessed = 0;
  let processed = 0;
  let inserted = 0;
  let updated = 0;
  let errors = 0;
  const maxPages = Math.min(Math.max(input.maxPages ?? 2, 1), 500);
  const lastAllowedPage = page + maxPages - 1;

  try {
    while (page <= totalPages && page <= lastAllowedPage) {
      const result = await provider.fetchProcurements({
        startDate: input.startDate,
        endDate: input.endDate,
        modalityCode: input.modalityCode,
        page,
        pageSize: input.pageSize ?? 10,
        state: input.state,
        cityIbgeCode: input.cityIbgeCode,
      });
      totalPages = Math.max(result.totalPages, 1);
      pagesProcessed += 1;

      for (const record of result.records) {
        try {
          if (input.skipUnchanged && await repository.isUnchanged(record)) { processed += 1; continue; }
          let normalizedResults: NormalizedProcurementResult[] = [];
          if (input.withItems !== false && provider.fetchItems) {
            try {
              record.items = await provider.fetchItems(record);
            } catch (itemError) {
              errors += 1;
              await client.from("sync_logs").insert({
                import_id: importId,
                source_id: source.id,
                endpoint: record.sourceEndpoint,
                level: "warning",
                message: errorMessage(itemError, "Itens indisponíveis na fonte.").slice(0, 500),
                metadata: { externalId: record.externalId, phase: "items" },
              });
            }
          }
          if (input.withItems !== false && record.items.length && provider.fetchResults) {
            try {
              normalizedResults = await provider.fetchResults(record);
            } catch (resultError) {
              errors += 1;
              await client.from("sync_logs").insert({
                import_id: importId,
                source_id: source.id,
                endpoint: record.sourceEndpoint,
                level: "warning",
                message: errorMessage(resultError, "Resultados homologados indisponíveis na fonte.").slice(0, 500),
                metadata: { externalId: record.externalId, phase: "results" },
              });
            }
          }
          const saved = await repository.save(record);
          if (normalizedResults.length) await repository.saveResults(provider.slug, normalizedResults);
          processed += 1;
          if (saved.inserted) inserted += 1;
          else updated += 1;
        } catch (recordError) {
          errors += 1;
          await client.from("sync_logs").insert({
            import_id: importId,
            source_id: source.id,
            endpoint: record.sourceEndpoint,
            level: "error",
            message: errorMessage(recordError, "Falha ao persistir licitação.").slice(0, 500),
            metadata: { externalId: record.externalId, phase: "persistence" },
          });
        }
      }

      await repository.markSyncProgress(provider.slug, page, `${input.endDate}:${input.modalityCode}:${page}`, {
        ...metadata,
        totalPages,
        processed,
        errors,
      });
      await client.from("imports").update({
        checkpoint: { page, totalPages, ...metadata },
        processed_count: processed + errors,
        inserted_count: inserted,
        updated_count: updated,
        error_count: errors,
      }).eq("id", importId);
      page += 1;
      if (page <= totalPages && page <= lastAllowedPage && (input.pageDelayMs ?? 0) > 0) {
        await new Promise((resolve) => setTimeout(resolve, input.pageDelayMs));
      }
    }

    const status = errors === 0 ? "succeeded" : processed > 0 ? "partial" : "failed";
    const truncated = page <= totalPages;
    const finalMetadata = { ...metadata, processed, inserted, updated, errors, pages: pagesProcessed, totalPages, truncated, nextPage: truncated ? page : null };
    await client.from("imports").update({
      finished_at: new Date().toISOString(),
      status,
      processed_count: processed + errors,
      inserted_count: inserted,
      updated_count: updated,
      error_count: errors,
    }).eq("id", importId);
    if (status === "failed") await repository.markSyncFailed(provider.slug, "Nenhum registro foi persistido.", finalMetadata);
    else await repository.markSyncSucceeded(provider.slug, finalMetadata);
    return { provider: provider.slug, status, processed, inserted, updated, errors, pages: pagesProcessed, truncated, nextPage: truncated ? page : undefined };
  } catch (error) {
    errors += 1;
    const message = errorMessage(error, "Falha desconhecida");
    await client.from("imports").update({
      finished_at: new Date().toISOString(),
      status: "failed",
      processed_count: processed + errors,
      inserted_count: inserted,
      updated_count: updated,
      error_count: errors,
    }).eq("id", importId);
    await client.from("sync_logs").insert({
      import_id: importId,
      source_id: source.id,
      endpoint,
      level: "error",
      message: message.slice(0, 500),
      metadata: { ...metadata, page },
    });
    await repository.markSyncFailed(provider.slug, error, { ...metadata, page, processed, errors });
    return { provider: provider.slug, status: "failed", processed, inserted, updated, errors, pages: pagesProcessed, message };
  }
}

export async function syncProcurements(input: ProcurementSyncInput) {
  const providerSlugs: ProcurementApiProviderSlug[] = input.providers ?? ["PNCP", "COMPRAS_GOV"];
  const selected = [...new Set<ProcurementApiProviderSlug>(providerSlugs)]
    .map((slug) => connectors[slug]);
  const results = await Promise.all(selected.map((provider) => syncProvider(provider, input)));
  const client = createAdminClient();
  let analyticsError: string | null = null;
  if (input.refreshAnalytics !== false && results.some((result) => result.processed > 0)) {
    const { error } = await client.rpc("refresh_market_analytics");
    if (error) {
      analyticsError = `Dados importados, mas a camada analítica não foi atualizada: ${error.message}`;
    }
  }
  return {
    status: results.every((result) => result.status === "failed") ? "failed"
      : analyticsError ? "partial"
      : results.some((result) => result.status !== "succeeded") ? "partial"
      : "succeeded",
    results,
    analyticsError,
  };
}

export async function refreshProcurementAnalytics() {
  const client = createAdminClient();
  const { error } = await client.rpc("refresh_market_analytics");
  if (error) throw new Error(`Falha ao atualizar a camada analítica: ${error.message}`);
}
