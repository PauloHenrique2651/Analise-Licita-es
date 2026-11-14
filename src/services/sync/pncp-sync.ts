import "server-only";
import { syncProcurements } from "@/services/procurement-sync-service";

type SyncInput = {
  dataInicial: string;
  dataFinal: string;
  codigoModalidadeContratacao: number;
  maxPages?: number;
};

function dashedDate(value: string) {
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

export async function syncPNCP(input: SyncInput) {
  const result = await syncProcurements({
    startDate: dashedDate(input.dataInicial),
    endDate: dashedDate(input.dataFinal),
    modalityCode: input.codigoModalidadeContratacao,
    providers: ["PNCP"],
    maxPages: input.maxPages,
  });
  const pncp = result.results[0];
  return { status: pncp.status, processed: pncp.processed, errors: pncp.errors, pages: pncp.pages };
}
