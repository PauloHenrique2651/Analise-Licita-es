import "server-only";
import { env } from "@/lib/env";
import { fetchJson } from "@/lib/http";
import { isValidCnpj, normalizeCnpj } from "@/utils/cnpj";

export type StateRegistrationResult = {
  code: string;
  status: "OK" | "ERROR";
  message: string;
  cnpj?: string;
  inscricao_estadual?: string;
  situacao_ie?: "Ativo" | "Inativo" | "Baixado" | string;
  uf?: string;
  municipio?: string;
  contribuinte_icms?: boolean;
};

export const sintegraProvider = {
  async getStateRegistration(cnpj: string): Promise<StateRegistrationResult> {
    if (!env.SINTEGRA_PROVIDER_API_KEY) {
      throw new Error("Token do SintegraWS não configurado.");
    }
    const normalized = normalizeCnpj(cnpj);
    if (!isValidCnpj(normalized)) throw new Error("CNPJ inválido.");
    const url = new URL(env.SINTEGRA_PROVIDER_URL);
    url.searchParams.set("token", env.SINTEGRA_PROVIDER_API_KEY);
    url.searchParams.set("cnpj", normalized);
    url.searchParams.set("plugin", "ST");
    const result = await fetchJson<StateRegistrationResult>(url, {
      provider: "SINTEGRA",
      cacheSeconds: 86_400,
      retries: 1,
    });
    if (result.status === "ERROR") throw new Error(`SintegraWS: ${result.message}`);
    return result;
  },
};
