import { syncIbgeGeography } from "../src/services/geography-sync-service";

syncIbgeGeography()
  .then((result) => process.stdout.write(JSON.stringify(result)))
  .catch((error: unknown) => {
    process.stderr.write(error instanceof Error ? error.message : "Falha ao sincronizar localidades do IBGE.");
    process.exitCode = 1;
  });
