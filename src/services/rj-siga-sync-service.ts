import "server-only";
import { fetchRjSigaProcurements, getRjSigaSnapshot } from "@/integrations/procurement/rj-siga/client";
import type { NormalizedProcurement } from "@/integrations/procurement/types";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { ProcurementRepository } from "@/repositories/procurement-repository";

const PROVIDER = "RJ_DADOS_ABERTOS_SIGA" as const;
const TERMINAL_STATUS = /homologad|adjudicad|anulad|revogad|fracassad|desert|encerrad|cancelad/i;

type RjSigaSyncInput = {
  startDate?: string;
  endDate?: string;
  force?: boolean;
  all?: boolean;
  concurrency?: number;
};

function inWindow(procurement: NormalizedProcurement, startDate?: string, endDate?: string) {
  if (!startDate && !endDate) return true;
  if (!procurement.publishedAt) return !TERMINAL_STATUS.test(procurement.status ?? "");
  const day = procurement.publishedAt.slice(0, 10);
  const publishedInWindow = (!startDate || day >= startDate) && (!endDate || day <= endDate);
  return publishedInWindow || !TERMINAL_STATUS.test(procurement.status ?? "");
}

function message(error: unknown) {
  return error instanceof Error ? error.message : "Falha desconhecida na sincronização RJ/SIGA.";
}

export async function syncRjSiga(input: RjSigaSyncInput = {}) {
  const client = createAdminClient();
  const repository = new ProcurementRepository(client);
  const source = await repository.getSource(PROVIDER);
  const snapshot = await getRjSigaSnapshot();
  const { data: previous } = await client.from("procurement_sync_state")
    .select("metadata")
    .eq("provider", PROVIDER)
    .maybeSingle();
  const previousSnapshot = (previous?.metadata as { snapshot?: typeof snapshot } | null)?.snapshot;
  await repository.markSyncStarted(PROVIDER, { snapshot, previousSnapshot: previousSnapshot ?? null, phase: "checking" });
  const unchanged = Boolean(
    !input.force && previousSnapshot &&
    ((snapshot.etag && snapshot.etag === previousSnapshot.etag) ||
      (snapshot.lastModified && snapshot.lastModified === previousSnapshot.lastModified && snapshot.contentLength === previousSnapshot.contentLength)),
  );

  if (unchanged) {
    const metadata = { snapshot, skipped: true, reason: "source_not_modified" };
    await repository.markSyncSucceeded(PROVIDER, metadata);
    return { provider: PROVIDER, status: "succeeded" as const, skipped: true, processed: 0, inserted: 0, updated: 0, errors: 0 };
  }

  const { data: importRun, error: importError } = await client.from("imports").insert({
    source_id: source.id,
    endpoint: env.RJ_SIGA_PROCUREMENTS_URL,
    checkpoint: { snapshot, startDate: input.startDate ?? null, endDate: input.endDate ?? null, all: input.all ?? false },
  }).select("id").single();
  if (importError || !importRun) throw importError ?? new Error("Falha ao iniciar importação RJ/SIGA.");
  const importId = importRun.id;

  let processed = 0;
  let inserted = 0;
  let updated = 0;
  let errors = 0;

  try {
    const downloaded = await fetchRjSigaProcurements();
    const selected = input.all ? downloaded : downloaded.filter((record) => inWindow(record, input.startDate, input.endDate));
    const concurrency = Math.max(1, Math.min(input.concurrency ?? 4, 8));
    let cursor = 0;

    async function worker() {
      while (cursor < selected.length) {
        const index = cursor;
        cursor += 1;
        const record = selected[index];
        try {
          const saved = await repository.save(record);
          processed += 1;
          if (saved.inserted) inserted += 1;
          else updated += 1;
        } catch (error) {
          errors += 1;
          if (errors <= 25) {
            await client.from("sync_logs").insert({
              import_id: importId,
              source_id: source.id,
              endpoint: env.RJ_SIGA_PROCUREMENTS_URL,
              level: "error",
              message: message(error).slice(0, 500),
              metadata: { externalId: record.externalId, phase: "persistence" },
            });
          }
        }
        if ((processed + errors) % 100 === 0) {
          await client.from("imports").update({
            checkpoint: { snapshot, position: processed + errors, selected: selected.length },
            processed_count: processed + errors,
            inserted_count: inserted,
            updated_count: updated,
            error_count: errors,
          }).eq("id", importId);
        }
      }
    }

    await Promise.all(Array.from({ length: Math.min(concurrency, selected.length || 1) }, () => worker()));
    const status = errors === 0 ? "succeeded" : processed > 0 ? "partial" : "failed";
    const metadata = { snapshot, downloaded: downloaded.length, selected: selected.length, processed, inserted, updated, errors, all: input.all ?? false };
    await client.from("imports").update({
      finished_at: new Date().toISOString(), status, processed_count: processed + errors,
      inserted_count: inserted, updated_count: updated, error_count: errors,
      checkpoint: metadata,
    }).eq("id", importId);
    if (status === "failed") await repository.markSyncFailed(PROVIDER, "Nenhum registro RJ/SIGA foi persistido.", metadata);
    else await repository.markSyncSucceeded(PROVIDER, metadata);

    if (processed > 0) await client.rpc("refresh_market_analytics");
    return { provider: PROVIDER, status, skipped: false, processed, inserted, updated, errors, downloaded: downloaded.length, selected: selected.length };
  } catch (error) {
    const errorText = message(error);
    await client.from("imports").update({
      finished_at: new Date().toISOString(), status: "failed", processed_count: processed + errors + 1,
      inserted_count: inserted, updated_count: updated, error_count: errors + 1,
    }).eq("id", importId);
    await client.from("sync_logs").insert({
      import_id: importId, source_id: source.id, endpoint: env.RJ_SIGA_PROCUREMENTS_URL,
      level: "error", message: errorText.slice(0, 500), metadata: { snapshot, phase: "download_or_parse" },
    });
    await repository.markSyncFailed(PROVIDER, error, { snapshot, processed, errors: errors + 1 });
    return { provider: PROVIDER, status: "failed" as const, skipped: false, processed, inserted, updated, errors: errors + 1, message: errorText };
  }
}

export const rjSigaSyncInternals = { inWindow };
