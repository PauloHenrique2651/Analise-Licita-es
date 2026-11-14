import "server-only";
import { env } from "@/lib/env";
import { fetchJson } from "@/lib/http";
import type { BrasilApiCompany } from "@/types/providers";
import { isValidCnpj, normalizeCnpj } from "@/utils/cnpj";

export const brasilApiProvider = {
  async getCompany(cnpj: string) {
    const normalized = normalizeCnpj(cnpj);
    if (!isValidCnpj(normalized)) throw new Error("CNPJ inválido.");
    const url = new URL(`${env.BRASIL_API_BASE_URL}/cnpj/v1/${normalized}`);
    return fetchJson<BrasilApiCompany>(url, {
      provider: "BRASIL_API",
      cacheSeconds: 86_400,
      retries: 2,
    });
  },

  async getAddress(cep: string) {
    const normalized = cep.replace(/\D/g, "");
    if (!/^\d{8}$/.test(normalized)) throw new Error("CEP inválido.");
    const url = new URL(`${env.BRASIL_API_BASE_URL}/cep/v2/${normalized}`);
    return fetchJson<Record<string, unknown>>(url, {
      provider: "BRASIL_API",
      cacheSeconds: 604_800,
    });
  },
};
