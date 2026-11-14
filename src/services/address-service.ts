import "server-only";
import { brasilApiProvider } from "@/providers/brasil-api-provider";
import { conectaGovProvider } from "@/providers/conecta-gov-provider";

export async function lookupAddress(cep: string) {
  if (conectaGovProvider.isConfigured()) {
    try {
      const data = await conectaGovProvider.getAddress(cep);
      return { data, source: "CEP_CONECTA" as const, fallbackUsed: false };
    } catch {
      // A indisponibilidade do provider oficial não bloqueia o preenchimento cadastral.
    }
  }
  return { data: await brasilApiProvider.getAddress(cep), source: "BRASIL_API" as const, fallbackUsed: conectaGovProvider.isConfigured() };
}
