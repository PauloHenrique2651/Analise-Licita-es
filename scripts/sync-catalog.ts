// Carrega o catálogo CATMAT/CATSER no banco para a busca por nome.
// Uso: npm run sync:catalog [-- --only=material|servico] [--restart] [--max-pages=N]
import { syncCatalog } from "../src/services/catalog-sync-service";

const args = process.argv.slice(2);
const only = args.find((arg) => arg.startsWith("--only="))?.split("=")[1];
const restart = args.includes("--restart");
const maxPagesArg = args.find((arg) => arg.startsWith("--max-pages="))?.split("=")[1];
const maxPages = maxPagesArg ? Math.max(1, Number(maxPagesArg)) : undefined;

async function main() {
  const kinds = (only === "material" || only === "servico" ? [only] : ["servico", "material"]) as Array<"material" | "servico">;
  const results = [];
  for (const kind of kinds) {
    results.push(await syncCatalog(kind, { restart, maxPages, log: (message) => console.log(message) }));
  }
  console.log(JSON.stringify(results));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
