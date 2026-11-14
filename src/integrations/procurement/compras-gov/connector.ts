import { env } from "@/lib/env";
import { fetchJson } from "@/lib/http";
import type { NormalizedProcurement, ProcurementFetchParams, ProcurementProvider } from "../types";
import { mapComprasGovItem, mapComprasGovProcurement, mapComprasGovResult } from "./mapper";
import { comprasGovItemPageSchema, comprasGovProcurementPageSchema, comprasGovResultPageSchema } from "./schemas";

function isoDay(value: string) {
  const date = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Data Compras.gov inválida; use YYYY-MM-DD.");
  return date;
}

export const comprasGovConnector: ProcurementProvider = {
  name: "Compras.gov.br",
  slug: "COMPRAS_GOV",

  async fetchProcurements(params: ProcurementFetchParams) {
    const pageNumber = params.page ?? 1;
    const url = new URL(`${env.COMPRAS_GOV_API_BASE_URL}/modulo-contratacoes/1_consultarContratacoes_PNCP_14133`);
    url.searchParams.set("dataPublicacaoPncpInicial", isoDay(params.startDate));
    url.searchParams.set("dataPublicacaoPncpFinal", isoDay(params.endDate));
    url.searchParams.set("codigoModalidade", String(params.modalityCode));
    url.searchParams.set("pagina", String(pageNumber));
    url.searchParams.set("tamanhoPagina", String(Math.max(10, Math.min(params.pageSize ?? 20, 500))));
    if (params.state) url.searchParams.set("unidadeOrgaoUfSigla", params.state.toUpperCase());
    if (params.cityIbgeCode) url.searchParams.set("unidadeOrgaoCodigoIbge", params.cityIbgeCode);

    const raw = await fetchJson<unknown>(url, { provider: "COMPRAS_GOV", timeoutMs: 20_000, retries: 1, cacheSeconds: 0 });
    const result = comprasGovProcurementPageSchema.parse(raw);
    return {
      records: result.resultado.map((record) => mapComprasGovProcurement(record, url.toString())),
      page: pageNumber,
      totalPages: result.totalPaginas,
      totalRecords: result.totalRegistros,
      remainingPages: result.paginasRestantes,
    };
  },

  async fetchItems(procurement: NormalizedProcurement) {
    const identifier = procurement.pncpId ?? procurement.externalId;
    const type = procurement.pncpId ? "numeroControlePNCPCompra" : "idCompra";
    const url = new URL(`${env.COMPRAS_GOV_API_BASE_URL}/modulo-contratacoes/2.1_consultarItensContratacoes_PNCP_14133_Id`);
    url.searchParams.set("tipo", type);
    url.searchParams.set("codigo", identifier);
    const raw = await fetchJson<unknown>(url, { provider: "COMPRAS_GOV", timeoutMs: 15_000, retries: 1, cacheSeconds: 3600 });
    return comprasGovItemPageSchema.parse(raw).resultado.map(mapComprasGovItem);
  },

  async fetchResults(procurement: NormalizedProcurement) {
    const identifier = procurement.pncpId ?? procurement.externalId;
    const type = procurement.pncpId ? "numeroControlePNCPCompra" : "idCompra";
    const url = new URL(`${env.COMPRAS_GOV_API_BASE_URL}/modulo-contratacoes/3.1_consultarResultadoItensContratacoes_PNCP_14133_Id`);
    url.searchParams.set("tipo", type);
    url.searchParams.set("codigo", identifier);
    const raw = await fetchJson<unknown>(url, { provider: "COMPRAS_GOV", timeoutMs: 20_000, retries: 2, cacheSeconds: 0 });
    return comprasGovResultPageSchema.parse(raw).resultado.map((result) => mapComprasGovResult(result, url.toString()));
  },

  async fetchProcurementById(externalId: string) {
    const url = new URL(`${env.COMPRAS_GOV_API_BASE_URL}/modulo-contratacoes/1.1_consultarContratacoes_PNCP_14133_Id`);
    url.searchParams.set("tipo", "numeroControlePNCPCompra");
    url.searchParams.set("codigo", externalId);
    const raw = await fetchJson<unknown>(url, { provider: "COMPRAS_GOV", timeoutMs: 20_000, retries: 2, cacheSeconds: 0 });
    const record = comprasGovProcurementPageSchema.parse(raw).resultado[0];
    return record ? mapComprasGovProcurement(record, url.toString()) : null;
  },
};

export async function fetchComprasGovResultPage(input: { startDate: string; endDate: string; page: number; pageSize: number }) {
  const url = new URL(`${env.COMPRAS_GOV_API_BASE_URL}/modulo-contratacoes/3_consultarResultadoItensContratacoes_PNCP_14133`);
  url.searchParams.set("dataResultadoPncpInicial", isoDay(input.startDate));
  url.searchParams.set("dataResultadoPncpFinal", isoDay(input.endDate));
  url.searchParams.set("pagina", String(input.page));
  url.searchParams.set("tamanhoPagina", String(input.pageSize));
  const raw = await fetchJson<unknown>(url, { provider: "COMPRAS_GOV", timeoutMs: 25_000, retries: 3, cacheSeconds: 0 });
  const parsed = comprasGovResultPageSchema.parse(raw);
  return {
    records: parsed.resultado.map((result) => mapComprasGovResult(result, url.toString())),
    totalPages: parsed.totalPaginas,
    totalRecords: parsed.totalRegistros,
    remainingPages: parsed.paginasRestantes,
  };
}
