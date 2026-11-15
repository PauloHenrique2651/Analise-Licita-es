import { env } from "@/lib/env";
import { fetchJson } from "@/lib/http";
import { mapPncpItem, mapPncpProcurement, mapPncpResult } from "./mapper";
import { pncpItemsResponseSchema, pncpResultsResponseSchema, pncpSearchPageSchema, type PncpItemDto, type PncpResultDto } from "./schemas";
import type { NormalizedProcurement, NormalizedProcurementResult, ProcurementFetchParams, ProcurementProvider } from "../types";

function compactDate(value: string) {
  const compact = value.replace(/-/g, "");
  if (!/^\d{8}$/.test(compact)) throw new Error("Data PNCP inválida; use YYYY-MM-DD.");
  return compact;
}

export const pncpConnector: ProcurementProvider = {
  name: "Portal Nacional de Contratações Públicas",
  slug: "PNCP",

  async fetchProcurements(params: ProcurementFetchParams) {
    const url = new URL(`${env.PNCP_API_BASE_URL}/v1/contratacoes/publicacao`);
    url.searchParams.set("dataInicial", compactDate(params.startDate));
    url.searchParams.set("dataFinal", compactDate(params.endDate));
    url.searchParams.set("codigoModalidadeContratacao", String(params.modalityCode));
    url.searchParams.set("pagina", String(params.page ?? 1));
    url.searchParams.set("tamanhoPagina", String(Math.min(params.pageSize ?? 20, 50)));
    if (params.state) url.searchParams.set("uf", params.state.toUpperCase());
    if (params.cityIbgeCode) url.searchParams.set("codigoMunicipioIbge", params.cityIbgeCode);

    const raw = await fetchJson<unknown>(url, {
      provider: "PNCP",
      timeoutMs: 22_000,
      retries: 2,
      cacheSeconds: 0,
    });
    // PNCP responde 204 (corpo vazio) quando o filtro não tem publicações: página vazia, não erro.
    if (raw === null) return { records: [], page: params.page ?? 1, totalPages: 0, totalRecords: 0, remainingPages: 0 };
    const page = pncpSearchPageSchema.parse(raw);
    return {
      records: page.data.map((record) => mapPncpProcurement(record, url.toString())),
      page: page.numeroPagina,
      totalPages: page.totalPaginas,
      totalRecords: page.totalRegistros,
      remainingPages: page.paginasRestantes,
    };
  },

  async fetchItems(procurement: NormalizedProcurement) {
    if (!procurement.agencyCnpj || !procurement.purchaseYear || !procurement.sequenceNumber) return [];
    const url = new URL(`${env.PNCP_SERVICE_BASE_URL}/v1/orgaos/${procurement.agencyCnpj}/compras/${procurement.purchaseYear}/${procurement.sequenceNumber}/itens`);
    url.searchParams.set("pagina", "1");
    url.searchParams.set("tamanhoPagina", "500");
    const raw = await fetchJson<unknown>(url, { provider: "PNCP", timeoutMs: 15_000, retries: 1, cacheSeconds: 3600 });
    const items = pncpItemsResponseSchema.parse(raw) as PncpItemDto[];
    return items.map((item) => mapPncpItem(item, procurement.pncpId ?? procurement.externalId));
  },

  async fetchResults(procurement: NormalizedProcurement) {
    if (!procurement.agencyCnpj || !procurement.purchaseYear || !procurement.sequenceNumber) return [];
    const items = procurement.items.filter((item) => item.itemNumber && item.hasResult !== false);
    const results: NormalizedProcurementResult[] = [];
    for (const item of items) {
      const url = new URL(`${env.PNCP_SERVICE_BASE_URL}/v1/orgaos/${procurement.agencyCnpj}/compras/${procurement.purchaseYear}/${procurement.sequenceNumber}/itens/${item.itemNumber}/resultados`);
      const raw = await fetchJson<unknown>(url, { provider: "PNCP", timeoutMs: 15_000, retries: 2, cacheSeconds: 0 });
      const parsed = pncpResultsResponseSchema.parse(raw) as PncpResultDto[];
      results.push(...parsed.map((result) => mapPncpResult(result, procurement.pncpId ?? procurement.externalId, url.toString())));
    }
    return results;
  },
};
