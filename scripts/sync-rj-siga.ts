import { syncRjSiga } from "../src/services/rj-siga-sync-service";

function argument(name: string) {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
}

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

async function main() {
  const end = new Date();
  const lookback = Math.max(1, Math.min(Number(process.env.RJ_SIGA_LOOKBACK_DAYS ?? 7), 90));
  const start = new Date(end.getTime() - lookback * 86_400_000);
  const result = await syncRjSiga({
    startDate: argument("start") ?? isoDay(start),
    endDate: argument("end") ?? isoDay(end),
    force: process.argv.includes("--force"),
    all: process.argv.includes("--all"),
    concurrency: Number(process.env.RJ_SIGA_SYNC_CONCURRENCY ?? 4),
  });
  process.stdout.write(JSON.stringify(result));
  if (result.status === "failed") process.exitCode = 1;
}

main().catch((error: unknown) => {
  process.stderr.write(error instanceof Error ? error.message : "Falha desconhecida na sincronização RJ/SIGA.");
  process.exitCode = 1;
});
