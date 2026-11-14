import { syncRjSigaItems } from "../src/services/rj-siga-items-sync-service";

async function main() {
  const result = await syncRjSigaItems({ force: process.argv.includes("--force") });
  process.stdout.write(JSON.stringify(result));
  if (result.status === "failed") process.exitCode = 1;
}

main().catch((error: unknown) => {
  process.stderr.write(error instanceof Error ? error.message : "Falha desconhecida na carga de itens RJ/SIGA.");
  process.exitCode = 1;
});
