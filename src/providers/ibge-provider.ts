import "server-only";
import { z } from "zod";
import { env } from "@/lib/env";
import { fetchJson } from "@/lib/http";

const regionSchema = z.object({ id: z.number().int(), sigla: z.string(), nome: z.string() });
const stateSchema = z.object({ id: z.number().int(), sigla: z.string().length(2), nome: z.string(), regiao: regionSchema });
const municipalitySchema = z.object({
  id: z.number().int(),
  nome: z.string(),
  "regiao-imediata": z.object({
    "regiao-intermediaria": z.object({ UF: stateSchema }),
  }),
});

export type IbgeState = z.infer<typeof stateSchema>;
export type IbgeMunicipality = z.infer<typeof municipalitySchema>;

export const ibgeProvider = {
  async getStates() {
    const url = new URL(`${env.IBGE_API_BASE_URL}/estados`);
    url.searchParams.set("orderBy", "nome");
    return z.array(stateSchema).parse(await fetchJson<unknown>(url, { provider: "IBGE", cacheSeconds: 604_800, retries: 2 }));
  },

  async getMunicipalities() {
    const url = new URL(`${env.IBGE_API_BASE_URL}/municipios`);
    url.searchParams.set("orderBy", "nome");
    return z.array(municipalitySchema).parse(await fetchJson<unknown>(url, { provider: "IBGE", cacheSeconds: 604_800, retries: 2, timeoutMs: 30_000 }));
  },
};
