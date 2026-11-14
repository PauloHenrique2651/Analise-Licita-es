import { createAdminClient } from "../src/lib/supabase/admin";
import { pncpProvider } from "../src/providers/pncp-provider";
import { refreshProcurementAnalytics, syncProcurements } from "../src/services/procurement-sync-service";
import type { ProcurementApiProviderSlug } from "../src/integrations/procurement/types";

const FALLBACK_MODALITIES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
const DAY = 86_400_000;

type BackfillCursor = {
  startDate: string;
  endDate: string;
  modalityIndex: number;
  nextPage: number;
  complete?: boolean;
};

function isoDay(date: Date) { return date.toISOString().slice(0, 10); }
function dateAt(value: string) { return new Date(`${value}T12:00:00.000Z`); }
function addDays(value: string, days: number) { return isoDay(new Date(dateAt(value).getTime() + days * DAY)); }
function boundedNumber(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(parsed, max)) : fallback;
}

async function modalities() {
  const configured = process.env.SYNC_MODALITY_CODES;
  if (configured) return [...new Set(configured.split(",").map(Number).filter((value) => Number.isInteger(value) && value > 0))];
  try { return (await pncpProvider.listActiveModalities()).map((item) => item.id); }
  catch { return FALLBACK_MODALITIES; }
}

async function main() {
  const providerInput = process.argv.find((value) => value.startsWith("--provider="))?.split("=")[1] ?? process.env.BACKFILL_PROVIDER ?? "PNCP";
  if (providerInput !== "PNCP" && providerInput !== "COMPRAS_GOV") throw new Error("BACKFILL_PROVIDER deve ser PNCP ou COMPRAS_GOV.");
  const provider = providerInput as ProcurementApiProviderSlug;
  const stateKey = `BACKFILL_${provider}`;
  const client = createAdminClient();
  const codes = await modalities();
  const floor = process.env.BACKFILL_MIN_DATE ?? "2021-01-01";
  const windowDays = boundedNumber(process.env.BACKFILL_WINDOW_DAYS, 1, 1, 7);
  const chunks = boundedNumber(process.env.BACKFILL_CHUNKS_PER_RUN, 4, 1, 12);
  const maxPages = boundedNumber(process.env.BACKFILL_MAX_PAGES, 25, 1, 25);
  const pageSize = boundedNumber(process.env.BACKFILL_PAGE_SIZE, provider === "PNCP" ? 50 : 250, 10, provider === "PNCP" ? 50 : 500);
  const withItems = process.env.BACKFILL_WITH_ITEMS === "true";
  const pageDelayMs = boundedNumber(process.env.BACKFILL_PAGE_DELAY_MS, provider === "PNCP" ? 1_500 : 300, 0, 10_000);
  const { data: stored } = await client.from("procurement_sync_state").select("metadata").eq("provider", stateKey).maybeSingle();
  const initialEnd = addDays(isoDay(new Date()), -3);
  const initialStart = addDays(initialEnd, -(windowDays - 1));
  let cursor: BackfillCursor = stored?.metadata && typeof stored.metadata === "object"
    ? stored.metadata as BackfillCursor
    : { startDate: initialStart, endDate: initialEnd, modalityIndex: 0, nextPage: 1 };
  let processed = 0;
  let inserted = 0;
  let updated = 0;
  let errors = 0;

  for (let chunk = 0; chunk < chunks && !cursor.complete; chunk += 1) {
    if (cursor.endDate < floor) { cursor = { ...cursor, complete: true }; break; }
    const modalityCode = codes[cursor.modalityIndex] ?? codes[0];
    const run = await syncProcurements({
      startDate: cursor.startDate < floor ? floor : cursor.startDate,
      endDate: cursor.endDate,
      modalityCode,
      providers: [provider],
      startPage: cursor.nextPage,
      maxPages,
      pageSize,
      withItems,
      refreshAnalytics: false,
      pageDelayMs,
    });
    const result = run.results[0];
    if (!result || result.status === "failed") {
      errors += result?.errors ?? 1;
      break;
    }
    processed += result.processed; inserted += result.inserted; updated += result.updated; errors += result.errors;
    if (result.truncated && result.nextPage) cursor = { ...cursor, nextPage: result.nextPage };
    else if (cursor.modalityIndex < codes.length - 1) cursor = { ...cursor, modalityIndex: cursor.modalityIndex + 1, nextPage: 1 };
    else {
      const nextEnd = addDays(cursor.startDate, -1);
      cursor = { startDate: addDays(nextEnd, -(windowDays - 1)), endDate: nextEnd, modalityIndex: 0, nextPage: 1, complete: nextEnd < floor };
    }
    const now = new Date().toISOString();
    const { error: stateError } = await client.from("procurement_sync_state").upsert({
      provider: stateKey, last_sync_at: now, last_success_at: now, last_cursor: `${cursor.endDate}:${cursor.modalityIndex}:${cursor.nextPage}`,
      last_page: cursor.nextPage, last_error: null, consecutive_failures: 0, metadata: cursor, updated_at: now,
    }, { onConflict: "provider" });
    if (stateError) throw stateError;
  }

  if (processed > 0) await refreshProcurementAnalytics();
  process.stdout.write(JSON.stringify({ provider, processed, inserted, updated, errors, cursor }));
}

main().catch((error: unknown) => {
  process.stderr.write(error instanceof Error ? error.message : "Falha desconhecida no preenchimento histórico.");
  process.exitCode = 1;
});
