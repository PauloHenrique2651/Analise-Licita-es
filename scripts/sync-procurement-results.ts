import { createAdminClient } from "../src/lib/supabase/admin";
import { refreshProcurementAnalytics } from "../src/services/procurement-sync-service";
import { syncProcurementResults } from "../src/services/procurement-results-sync-service";

const DAY = 86_400_000;
function isoDay(date: Date) { return date.toISOString().slice(0, 10); }
function addDays(value: string, days: number) { return isoDay(new Date(new Date(`${value}T12:00:00.000Z`).getTime() + days * DAY)); }
function bounded(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(parsed, max)) : fallback;
}

async function recent() {
  const client = createAdminClient();
  const endDate = isoDay(new Date());
  const startDate = addDays(endDate, -bounded(process.env.RESULT_SYNC_LOOKBACK_DAYS, 30, 1, 90));
  const stateKey = "COMPRAS_GOV_RESULTS";
  const { data: state } = await client.from("procurement_sync_state").select("metadata").eq("provider", stateKey).maybeSingle();
  const metadata = state?.metadata && typeof state.metadata === "object" ? state.metadata as Record<string, unknown> : {};
  const sameWindow = metadata.startDate === startDate && metadata.endDate === endDate;
  const startPage = sameWindow ? bounded(String(metadata.nextPage ?? 1), 1, 1, 1_000_000) : 1;
  return syncProcurementResults({
    startDate, endDate, startPage, stateKey,
    maxPages: bounded(process.env.RESULT_SYNC_MAX_PAGES, 4, 1, 25),
    pageSize: bounded(process.env.RESULT_SYNC_PAGE_SIZE, 250, 10, 500),
    hydrateMissingLimit: bounded(process.env.RESULT_SYNC_HYDRATE_LIMIT, 40, 0, 200),
    pageDelayMs: bounded(process.env.RESULT_SYNC_PAGE_DELAY_MS, 300, 0, 10_000),
  });
}

async function backfill() {
  const client = createAdminClient();
  const stateKey = "BACKFILL_COMPRAS_GOV_RESULTS";
  const floor = process.env.RESULT_BACKFILL_MIN_DATE ?? "2021-01-01";
  const windowDays = bounded(process.env.RESULT_BACKFILL_WINDOW_DAYS, 7, 1, 31);
  const windowsPerRun = bounded(process.env.RESULT_BACKFILL_WINDOWS_PER_RUN, 4, 1, 12);
  const { data: state } = await client.from("procurement_sync_state").select("metadata").eq("provider", stateKey).maybeSingle();
  const stored = state?.metadata && typeof state.metadata === "object" ? state.metadata as Record<string, unknown> : {};
  const initialEnd = addDays(isoDay(new Date()), -31);
  let endDate = typeof stored.windowEnd === "string" ? stored.windowEnd : initialEnd;
  let startDate = typeof stored.windowStart === "string" ? stored.windowStart : addDays(endDate, -(windowDays - 1));
  let startPage = bounded(typeof stored.nextPage === "number" ? String(stored.nextPage) : undefined, 1, 1, 1_000_000);
  const totals = { status: "succeeded", windows: 0, discovered: 0, inserted: 0, updated: 0, deferred: 0, errors: 0, cursor: endDate };
  for (let window = 0; window < windowsPerRun && endDate >= floor; window += 1) {
    if (startDate < floor) startDate = floor;
    const result = await syncProcurementResults({
      startDate, endDate, startPage, stateKey,
      maxPages: bounded(process.env.RESULT_BACKFILL_MAX_PAGES, 10, 1, 25),
      pageSize: bounded(process.env.RESULT_BACKFILL_PAGE_SIZE, 250, 10, 500),
      hydrateMissingLimit: bounded(process.env.RESULT_BACKFILL_HYDRATE_LIMIT, 100, 0, 200),
      pageDelayMs: bounded(process.env.RESULT_BACKFILL_PAGE_DELAY_MS, 500, 0, 10_000),
      refreshAnalytics: false,
    });
    totals.windows += 1;
    totals.discovered += result.discovered;
    totals.inserted += result.inserted;
    totals.updated += result.updated;
    totals.deferred += result.deferred;
    totals.errors += result.errors;
    if (result.status === "failed") { totals.status = "failed"; break; }
    const now = new Date().toISOString();
    if (result.truncated) {
      await client.from("procurement_sync_state").upsert({
        provider: stateKey, last_sync_at: now, last_success_at: now, last_cursor: `${endDate}:${result.nextPage}`,
        last_page: result.nextPage, last_error: null, consecutive_failures: 0,
        metadata: { windowStart: startDate, windowEnd: endDate, nextPage: result.nextPage }, updated_at: now,
      }, { onConflict: "provider" });
      totals.status = "partial";
      break;
    }
    endDate = addDays(startDate, -1);
    startDate = addDays(endDate, -(windowDays - 1));
    startPage = 1;
    totals.cursor = endDate;
    await client.from("procurement_sync_state").upsert({
      provider: stateKey, last_sync_at: now, last_success_at: now, last_cursor: endDate,
      last_page: 1, last_error: null, consecutive_failures: 0,
      metadata: { windowStart: startDate, windowEnd: endDate, nextPage: 1, complete: endDate < floor }, updated_at: now,
    }, { onConflict: "provider" });
  }
  if (totals.inserted + totals.updated > 0) await refreshProcurementAnalytics();
  return totals;
}

const mode = process.argv.includes("--backfill") ? "backfill" : "recent";
(mode === "backfill" ? backfill() : recent()).then((result) => {
  process.stdout.write(JSON.stringify({ mode, result }));
  if ("status" in result && result.status === "failed") process.exitCode = 1;
}).catch((error: unknown) => {
  process.stderr.write(error instanceof Error ? error.message : "Falha na sincronização de resultados.");
  process.exitCode = 1;
});
