import "server-only";
import { z } from "zod";
import { DEFAULT_SUPABASE_PUBLISHABLE_KEY, DEFAULT_SUPABASE_URL } from "@/lib/supabase/public-config";

const blankToUndefined = (value: unknown) => {
  if (typeof value !== "string") return value;
  return value.trim() === "" ? undefined : value.trim();
};

const optionalText = (minimumLength = 1) => z.preprocess(blankToUndefined, z.string().min(minimumLength).optional());
const defaultUrl = (fallback: string) => z.preprocess(blankToUndefined, z.string().url().default(fallback));

const serverEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.preprocess(blankToUndefined, z.string().url().default(DEFAULT_SUPABASE_URL)),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.preprocess(blankToUndefined, z.string().min(1).default(DEFAULT_SUPABASE_PUBLISHABLE_KEY)),
  SUPABASE_SECRET_KEY: optionalText(),
  APP_OWNER_EMAIL: z.preprocess(blankToUndefined, z.string().email().default("paulohenrique.cardoso2651@gmail.com")),
  PNCP_API_BASE_URL: defaultUrl("https://pncp.gov.br/api/consulta"),
  PNCP_SERVICE_BASE_URL: defaultUrl("https://pncp.gov.br/api/pncp"),
  COMPRAS_GOV_API_BASE_URL: defaultUrl("https://dadosabertos.compras.gov.br"),
  RJ_SIGA_PROCUREMENTS_URL: defaultUrl("https://www.compras.rj.gov.br/siga/imagens/LICITACOES.CSV"),
  RJ_SIGA_ITEMS_URL: defaultUrl("https://www.compras.rj.gov.br/siga/imagens/ITENS_LICITACOES.CSV"),
  BRASIL_API_BASE_URL: defaultUrl("https://brasilapi.com.br/api"),
  IBGE_API_BASE_URL: defaultUrl("https://servicodados.ibge.gov.br/api/v1/localidades"),
  CONNECTA_GOV_API_BASE_URL: defaultUrl("https://apigateway.conectagov.estaleiro.serpro.gov.br"),
  CONNECTA_GOV_TOKEN_URL: defaultUrl("https://apigateway.conectagov.estaleiro.serpro.gov.br/oauth2/jwt-token"),
  CONNECTA_GOV_CLIENT_ID: optionalText(),
  CONNECTA_GOV_CLIENT_SECRET: optionalText(),
  CONNECTA_GOV_ACCESS_TOKEN: optionalText(),
  CONNECTA_GOV_USER_CPF: z.preprocess(blankToUndefined, z.string().regex(/^\d{11}$/).optional()),
  SINTEGRA_PROVIDER_URL: defaultUrl("https://www.sintegraws.com.br/api/v1/execute-api.php"),
  SINTEGRA_PROVIDER_API_KEY: optionalText(),
  INTERNAL_SYNC_SECRET: optionalText(32),
});

export const env = serverEnvSchema.parse(process.env);

export function hasSupabaseEnv() {
  return Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}

export function hasConectaGovEnv() {
  const hasToken = Boolean(env.CONNECTA_GOV_ACCESS_TOKEN);
  const hasClientCredentials = Boolean(env.CONNECTA_GOV_CLIENT_ID && env.CONNECTA_GOV_CLIENT_SECRET);
  return Boolean(env.CONNECTA_GOV_USER_CPF && (hasToken || hasClientCredentials));
}
