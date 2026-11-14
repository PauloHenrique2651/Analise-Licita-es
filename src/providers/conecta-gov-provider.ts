import "server-only";
import { z } from "zod";
import { env, hasConectaGovEnv } from "@/lib/env";
import { fetchJson, ProviderError } from "@/lib/http";
import type { ConectaGovCompany } from "@/types/providers";
import { isValidCnpj, normalizeCnpj } from "@/utils/cnpj";

const companySchema = z.object({
  ni: z.string().min(14),
  nomeEmpresarial: z.string().min(1),
  nomeFantasia: z.string().nullable().optional(),
  nomefantasia: z.string().nullable().optional(),
  situacaoCadastral: z.object({ codigo: z.string().optional(), data: z.string().optional(), motivo: z.string().optional() }).nullable().optional(),
  naturezaJuridica: z.object({ codigo: z.string().optional(), descricao: z.string().optional() }).nullable().optional(),
  cnaePrincipal: z.object({ codigo: z.string().optional(), descricao: z.string().optional() }).nullable().optional(),
  cnaeSecundarias: z.array(z.object({ codigo: z.string().optional(), descricao: z.string().optional() })).optional(),
  endereco: z.object({
    tipoLogradouro: z.string().optional(), logradouro: z.string().optional(), numero: z.string().optional(),
    complemento: z.string().optional(), cep: z.string().optional(), bairro: z.string().optional(), uf: z.string().optional(),
    municipio: z.object({ codigo: z.string().optional(), descricao: z.string().optional() }).optional(),
  }).nullable().optional(),
  capitalSocial: z.string().optional(),
  porte: z.string().optional(),
  porteEmpresa: z.string().optional(),
}).passthrough();

const addressSchema = z.object({
  cep: z.union([z.string(), z.number()]).optional(),
  uf: z.string().optional(),
  cidade: z.string().optional(),
  bairro: z.string().optional(),
  endereco: z.string().optional(),
  complemento: z.string().optional(),
  codigoIbge: z.union([z.string(), z.number()]).optional(),
}).passthrough();

const tokenSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.coerce.number().positive().default(300),
}).passthrough();

let cachedToken: { value: string; expiresAt: number } | null = null;

async function accessToken() {
  if (env.CONNECTA_GOV_ACCESS_TOKEN) return env.CONNECTA_GOV_ACCESS_TOKEN;
  if (!env.CONNECTA_GOV_CLIENT_ID || !env.CONNECTA_GOV_CLIENT_SECRET) {
    throw new Error("Credenciais OAuth2 do Conecta gov.br não configuradas.");
  }
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.value;

  const authorization = Buffer.from(`${env.CONNECTA_GOV_CLIENT_ID}:${env.CONNECTA_GOV_CLIENT_SECRET}`).toString("base64");
  const response = await fetch(env.CONNECTA_GOV_TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${authorization}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new ProviderError(`Conecta gov.br respondeu com HTTP ${response.status} ao autenticar.`, response.status, "CONECTA_GOV");
  const token = tokenSchema.parse(await response.json());
  cachedToken = { value: token.access_token, expiresAt: Date.now() + token.expires_in * 1_000 };
  return token.access_token;
}

async function authenticatedHeaders() {
  if (!hasConectaGovEnv() || !env.CONNECTA_GOV_USER_CPF) {
    throw new Error("Conecta gov.br aguarda credenciamento, CPF consumidor e credenciais no servidor.");
  }
  return {
    Authorization: `Bearer ${await accessToken()}`,
    "x-cpf-usuario": env.CONNECTA_GOV_USER_CPF,
  };
}

export const conectaGovProvider = {
  isConfigured: hasConectaGovEnv,

  async getCompany(cnpj: string): Promise<ConectaGovCompany> {
    const normalized = normalizeCnpj(cnpj);
    if (!isValidCnpj(normalized)) throw new Error("CNPJ inválido.");
    const url = new URL(`${env.CONNECTA_GOV_API_BASE_URL}/api-cnpj-empresa/v2/empresa/${normalized}`);
    const raw = await fetchJson<unknown>(url, {
      provider: "CNPJ_CONECTA",
      headers: await authenticatedHeaders(),
      cacheSeconds: 86_400,
      retries: 2,
    });
    return companySchema.parse(raw) as ConectaGovCompany;
  },

  async getAddress(cep: string) {
    const normalized = cep.replace(/\D/g, "");
    if (!/^\d{8}$/.test(normalized)) throw new Error("CEP inválido.");
    const url = new URL(`${env.CONNECTA_GOV_API_BASE_URL}/api-cep/v1/consulta/cep/${normalized}`);
    const raw = await fetchJson<unknown>(url, {
      provider: "CEP_CONECTA",
      headers: await authenticatedHeaders(),
      cacheSeconds: 604_800,
      retries: 2,
    });
    return addressSchema.parse(raw);
  },
};
