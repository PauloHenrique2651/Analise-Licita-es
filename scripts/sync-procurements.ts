import { refreshProcurementAnalytics, syncProcurements } from "../src/services/procurement-sync-service";
import type { ProcurementApiProviderSlug } from "../src/integrations/procurement/types";
import { pncpProvider } from "../src/providers/pncp-provider";

// Snapshot oficial verificado em 2026-09-02; a rotina consulta /v1/modalidades antes de usar este fallback.
const VERIFIED_ACTIVE_MODALITY_CODES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

async function main() {
  const quick = process.argv.includes("--quick");
  const argument = (name: string) => process.argv.find((value) => value.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
  const end = new Date();
  const lookbackDays = quick ? 1 : Math.max(1, Math.min(Number(process.env.SYNC_LOOKBACK_DAYS ?? 2), 30));
  const start = new Date(end.getTime() - lookbackDays * 86_400_000);
  const maxPages = quick ? 1 : Math.max(1, Math.min(Number(process.env.SYNC_MAX_PAGES ?? 2), 500));
  const explicitStart = argument("start");
  const explicitEnd = argument("end");
  const configuredCodes = argument("modality") ?? process.env.SYNC_MODALITY_CODES;
  let codes: number[];
  if (configuredCodes) {
    codes = configuredCodes.split(",").map((value) => Number(value.trim())).filter((value) => Number.isInteger(value) && value > 0);
  } else {
    try {
      codes = (await pncpProvider.listActiveModalities()).map((modality) => modality.id);
    } catch {
      codes = VERIFIED_ACTIVE_MODALITY_CODES;
    }
  }
  codes = [...new Set(codes)];
  if (codes.length === 0) throw new Error("Nenhuma modalidade válida foi configurada ou descoberta no PNCP.");

  const runs: Array<Awaited<ReturnType<typeof syncProcurements>>> = new Array(codes.length);
  const provider = argument("provider");
  const providers: ProcurementApiProviderSlug[] | undefined = provider === "PNCP" || provider === "COMPRAS_GOV" ? [provider] : undefined;
  const withItems = !quick && process.env.SYNC_WITH_ITEMS !== "false";
  const pageSize = Math.max(10, Math.min(Number(process.env.SYNC_PAGE_SIZE ?? 50), provider === "COMPRAS_GOV" ? 500 : 50));
  const concurrency = Math.max(1, Math.min(Number(process.env.SYNC_MODALITY_CONCURRENCY ?? 1), 5));
  const defaultDelay = provider === "PNCP" ? 3_000 : 750;
  const modalityDelayMs = Math.max(0, Math.min(Number(process.env.SYNC_MODALITY_DELAY_MS ?? defaultDelay), 15_000));
  const pageDelayMs = Math.max(0, Math.min(Number(process.env.SYNC_PAGE_DELAY_MS ?? (provider === "PNCP" ? 1_250 : 250)), 10_000));
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < codes.length) {
      const index = nextIndex;
      nextIndex += 1;
      runs[index] = await syncProcurements({
        startDate: explicitStart ?? isoDay(start),
        endDate: explicitEnd ?? isoDay(end),
        modalityCode: codes[index],
        providers,
        maxPages,
        pageSize,
        withItems,
        skipUnchanged: process.env.SYNC_SKIP_UNCHANGED === "true",
        state: argument("state"),
        refreshAnalytics: false,
        pageDelayMs,
      });
      if (nextIndex < codes.length && modalityDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, modalityDelayMs));
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, codes.length) }, () => worker()));
  if (runs.some((run) => run.results.some((result) => result.processed > 0))) await refreshProcurementAnalytics();
  process.stdout.write(JSON.stringify({ runs }));
  if (runs.every((run) => run.status === "failed")) process.exitCode = 1;
}

main().catch((error: unknown) => {
  process.stderr.write(error instanceof Error ? error.message : "Falha desconhecida na sincronização.");
  process.exitCode = 1;
});
