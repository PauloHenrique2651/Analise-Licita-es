import { createAdminClient } from "../src/lib/supabase/admin";
import type { ProcurementApiProviderSlug } from "../src/integrations/procurement/types";
import { pncpProvider } from "../src/providers/pncp-provider";
import { refreshProcurementAnalytics, syncProcurements } from "../src/services/procurement-sync-service";
import { syncProcurementResults } from "../src/services/procurement-results-sync-service";

const FALLBACK_MODALITIES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
const DAY = 86_400_000;
function isoDay(date: Date) { return date.toISOString().slice(0, 10); }

async function main() {
  const client = createAdminClient();
  const now = new Date();
  const staleMinutes = Math.max(15, Math.min(Number(process.env.SYNC_WATCHDOG_STALE_MINUTES ?? 30), 180));
  const staleBefore = new Date(now.getTime() - staleMinutes * 60_000).toISOString();
  const abandonedBefore = new Date(now.getTime() - 60 * 60_000).toISOString();
  await client.from("imports").update({
    status: "failed", finished_at: now.toISOString(),
  }).eq("status", "running").lt("started_at", abandonedBefore);

  const keys = ["PNCP", "COMPRAS_GOV", "COMPRAS_GOV_RESULTS"];
  const { data: states, error } = await client.from("procurement_sync_state")
    .select("provider,last_success_at,last_sync_at")
    .in("provider", keys);
  if (error) throw error;
  const byKey = new Map((states ?? []).map((state) => [state.provider, state]));
  const isStale = (key: string) => {
    const state = byKey.get(key);
    const heartbeat = state?.last_success_at ?? state?.last_sync_at;
    return !heartbeat || heartbeat < staleBefore;
  };
  const actions: unknown[] = [];
  let changed = false;
  let modalities = FALLBACK_MODALITIES;
  try { modalities = (await pncpProvider.listActiveModalities()).map((item) => item.id); } catch { /* fallback oficial verificado */ }
  const modalityCode = modalities[Math.floor(now.getTime() / (15 * 60_000)) % modalities.length] ?? 6;
  const startDate = isoDay(new Date(now.getTime() - 3 * DAY));
  const endDate = isoDay(now);

  for (const provider of ["PNCP", "COMPRAS_GOV"] satisfies ProcurementApiProviderSlug[]) {
    if (!isStale(provider)) continue;
    const result = await syncProcurements({
      startDate, endDate, modalityCode, providers: [provider], maxPages: 1,
      pageSize: provider === "PNCP" ? 50 : 200, withItems: false,
      refreshAnalytics: false, pageDelayMs: 0,
    });
    actions.push({ provider, modalityCode, result });
    changed ||= result.results.some((item) => item.processed > 0);
  }
  if (isStale("COMPRAS_GOV_RESULTS")) {
    const result = await syncProcurementResults({
      startDate: isoDay(new Date(now.getTime() - 30 * DAY)), endDate,
      maxPages: 1, pageSize: 250, hydrateMissingLimit: 25,
      stateKey: "COMPRAS_GOV_RESULTS", refreshAnalytics: false,
    });
    actions.push({ provider: "COMPRAS_GOV_RESULTS", result });
    changed ||= result.inserted + result.updated > 0;
  }
  if (changed) await refreshProcurementAnalytics();
  process.stdout.write(JSON.stringify({ checkedAt: now.toISOString(), staleBefore, actions }));
}

main().catch((error: unknown) => {
  process.stderr.write(error instanceof Error ? error.message : "Falha no watchdog de sincronização.");
  process.exitCode = 1;
});
