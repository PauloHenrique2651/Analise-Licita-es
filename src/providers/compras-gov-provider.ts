import "server-only";
import { z } from "zod";
import { env } from "@/lib/env";
import { fetchJson } from "@/lib/http";

const catalogQuery = z.object({
  codigoItem: z.string().regex(/^\d+$/).optional(),
  descricaoItem: z.string().trim().min(2).max(120).optional(),
  pagina: z.number().int().min(1).default(1),
  tamanhoPagina: z.number().int().min(1).max(100).default(30),
});

const genericPageSchema = z.object({
  resultado: z.array(z.record(z.string(), z.unknown())).default([]),
  totalRegistros: z.number().int().nonnegative().default(0),
  totalPaginas: z.number().int().nonnegative().default(0),
  paginasRestantes: z.number().int().nonnegative().default(0),
}).passthrough();

const priceResearchQuery = z.object({
  kind: z.enum(["material", "servico"]),
  code: z.string().regex(/^\d{1,9}$/),
  uf: z.string().regex(/^[A-Z]{2}$/).optional(),
  municipio: z.string().regex(/^\d{7}$/).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  page: z.number().int().min(1).default(1),
});

export const comprasGovProvider = {
  /** Painel de Preços (Compras.gov.br): compras homologadas de um item CATMAT/CATSER, filtráveis por UF e município IBGE. */
  async searchPriceResearch(input: z.input<typeof priceResearchQuery>) {
    const query = priceResearchQuery.parse(input);
    const endpoint = query.kind === "material" ? "1_consultarMaterial" : "3_consultarServico";
    const url = new URL(`${env.COMPRAS_GOV_API_BASE_URL}/modulo-pesquisa-preco/${endpoint}`);
    if (query.kind === "material") {
      url.searchParams.set("tipo", "codigoItemCatalogo");
      url.searchParams.set("codigo", query.code);
    } else {
      url.searchParams.set("codigoItemCatalogo", query.code);
    }
    if (query.uf) url.searchParams.set("estado", query.uf);
    if (query.municipio) url.searchParams.set("codigoMunicipio", query.municipio);
    if (query.from) url.searchParams.set("dataCompraInicio", query.from);
    if (query.to) url.searchParams.set("dataCompraFim", query.to);
    url.searchParams.set("pagina", String(query.page));
    url.searchParams.set("tamanhoPagina", "500");
    const response = await fetchJson<unknown>(url, { provider: "COMPRAS_GOV", cacheSeconds: 21_600, sharedCacheSeconds: 21_600, retries: 2, timeoutMs: 45_000 });
    return genericPageSchema.parse(response);
  },

  async searchMaterials(input: z.input<typeof catalogQuery>) {
    const query = catalogQuery.parse(input);
    const url = new URL(`${env.COMPRAS_GOV_API_BASE_URL}/modulo-material/4_consultarItemMaterial`);
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined) url.searchParams.set(key, String(value));
    });
    const response = await fetchJson<unknown>(url, {
      provider: "COMPRAS_GOV",
      cacheSeconds: 86_400,
      sharedCacheSeconds: 86_400,
      retries: 2,
    });
    return genericPageSchema.parse(response);
  },

  async searchMaterialPrices(codigoItem: string, pagina = 1) {
    if (!/^\d+$/.test(codigoItem)) throw new Error("Código CATMAT inválido.");
    const url = new URL(`${env.COMPRAS_GOV_API_BASE_URL}/modulo-pesquisa-preco/1_consultarMaterial`);
    url.searchParams.set("tipo", "codigoItemCatalogo");
    url.searchParams.set("codigo", codigoItem);
    url.searchParams.set("pagina", String(Math.max(1, pagina)));
    url.searchParams.set("tamanhoPagina", "100");
    const response = await fetchJson<unknown>(url, {
      provider: "COMPRAS_GOV",
      cacheSeconds: 21_600,
      sharedCacheSeconds: 21_600,
      retries: 2,
    });
    return genericPageSchema.parse(response);
  },
};
