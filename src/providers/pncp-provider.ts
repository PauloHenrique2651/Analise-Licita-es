import "server-only";
import { z } from "zod";
import { env } from "@/lib/env";
import { fetchJson } from "@/lib/http";
import {
  pncpContractsSchema, pncpDocumentsSchema, pncpHistorySchema, pncpItemsResponseSchema,
  pncpMinutesSchema, pncpModalitiesSchema, pncpProcurementSchema, pncpSearchPageSchema,
} from "@/integrations/procurement/pncp/schemas";

const searchSchema = z.object({
  dataInicial: z.string().regex(/^\d{8}$/),
  dataFinal: z.string().regex(/^\d{8}$/),
  codigoModalidadeContratacao: z.number().int().positive(),
  pagina: z.number().int().min(1).default(1),
  tamanhoPagina: z.number().int().min(1).max(50).default(50),
  uf: z.string().length(2).toUpperCase().optional(),
  codigoMunicipioIbge: z.string().regex(/^\d{7}$/).optional(),
});

export type PncpSearch = z.input<typeof searchSchema>;

export const pncpProvider = {
  async listActiveModalities() {
    const url = new URL(`${env.PNCP_SERVICE_BASE_URL}/v1/modalidades`);
    url.searchParams.set("statusAtivo", "true");
    const raw = await fetchJson<unknown>(url, { provider: "PNCP", cacheSeconds: 86_400, retries: 2, timeoutMs: 20_000 });
    return pncpModalitiesSchema.parse(raw).filter((modality) => modality.statusAtivo);
  },

  async searchProcurements(input: PncpSearch) {
    const query = searchSchema.parse(input);
    const url = new URL(`${env.PNCP_API_BASE_URL}/v1/contratacoes/publicacao`);
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined) url.searchParams.set(key, String(value));
    });
    const response = await fetchJson<unknown>(url, {
      provider: "PNCP",
      cacheSeconds: 900,
      retries: 2,
      timeoutMs: 75_000,
    });
    // PNCP responde 204 (corpo vazio) quando não há publicações no filtro: é página vazia, não erro.
    if (response === null) return { data: [], totalRegistros: 0, totalPaginas: 0, numeroPagina: query.pagina ?? 1, paginasRestantes: 0 };
    return pncpSearchPageSchema.parse(response);
  },

  async getProcurement(cnpj: string, ano: number, sequencial: number) {
    const cleanCnpj = cnpj.replace(/\D/g, "");
    if (!/^\d{14}$/.test(cleanCnpj)) throw new Error("CNPJ de órgão inválido.");
    const url = new URL(
      `${env.PNCP_API_BASE_URL}/v1/orgaos/${cleanCnpj}/compras/${ano}/${sequencial}`,
    );
    return pncpProcurementSchema.parse(await fetchJson<unknown>(url, { provider: "PNCP", cacheSeconds: 3600 }));
  },

  async getItems(cnpj: string, ano: number, sequencial: number, pagina = 1) {
    const cleanCnpj = cnpj.replace(/\D/g, "");
    if (!/^\d{14}$/.test(cleanCnpj)) throw new Error("CNPJ de órgão inválido.");
    const url = new URL(
      `${env.PNCP_SERVICE_BASE_URL}/v1/orgaos/${cleanCnpj}/compras/${ano}/${sequencial}/itens`,
    );
    url.searchParams.set("pagina", String(Math.max(1, pagina)));
    url.searchParams.set("tamanhoPagina", "50");
    return pncpItemsResponseSchema.parse(await fetchJson<unknown>(url, { provider: "PNCP", cacheSeconds: 3600 }));
  },

  async getDocuments(cnpj: string, year: number, sequence: number) {
    const cleanCnpj = validateCnpj(cnpj);
    const url = new URL(`${env.PNCP_SERVICE_BASE_URL}/v1/orgaos/${cleanCnpj}/compras/${year}/${sequence}/arquivos`);
    return pncpDocumentsSchema.parse(await fetchJson<unknown>(url, detailRequest));
  },

  async getPriceRegistrationMinutes(cnpj: string, year: number, sequence: number) {
    const cleanCnpj = validateCnpj(cnpj);
    const url = new URL(`${env.PNCP_SERVICE_BASE_URL}/v1/orgaos/${cleanCnpj}/compras/${year}/${sequence}/atas`);
    return pncpMinutesSchema.parse(await fetchJson<unknown>(url, detailRequest));
  },

  async getContracts(cnpj: string, year: number, sequence: number) {
    const cleanCnpj = validateCnpj(cnpj);
    const url = new URL(`${env.PNCP_SERVICE_BASE_URL}/v1/orgaos/${cleanCnpj}/contratos/contratacao/${year}/${sequence}`);
    return pncpContractsSchema.parse(await fetchJson<unknown>(url, detailRequest));
  },

  async getHistory(cnpj: string, year: number, sequence: number) {
    const cleanCnpj = validateCnpj(cnpj);
    const url = new URL(`${env.PNCP_SERVICE_BASE_URL}/v1/orgaos/${cleanCnpj}/compras/${year}/${sequence}/historico`);
    return pncpHistorySchema.parse(await fetchJson<unknown>(url, detailRequest));
  },
};

const detailRequest = { provider: "PNCP", cacheSeconds: 300, retries: 1, timeoutMs: 20_000 } as const;

function validateCnpj(cnpj: string) {
  const cleanCnpj = cnpj.replace(/\D/g, "");
  if (!/^\d{14}$/.test(cleanCnpj)) throw new Error("CNPJ de órgão inválido.");
  return cleanCnpj;
}
