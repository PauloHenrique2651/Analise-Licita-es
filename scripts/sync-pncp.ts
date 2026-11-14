import { syncPNCP } from "../src/services/sync/pncp-sync";

function compactDate(date: Date) {
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}`;
}

async function main() {
  const end = new Date();
  const lookbackDays = Math.max(1, Math.min(Number(process.env.SYNC_LOOKBACK_DAYS ?? 2), 30));
  const start = new Date(end.getTime() - lookbackDays * 86_400_000);
  const maxPages = Math.max(1, Math.min(Number(process.env.SYNC_MAX_PAGES ?? 2), 25));
  const result = await syncPNCP({
    dataInicial: compactDate(start),
    dataFinal: compactDate(end),
    codigoModalidadeContratacao: 6,
    maxPages,
  });
  process.stdout.write(JSON.stringify(result));
  if (result.status === "failed") process.exitCode = 1;
}

main().catch((error: unknown) => {
  process.stderr.write(error instanceof Error ? error.message : "Falha desconhecida na sincronização.");
  process.exitCode = 1;
});
