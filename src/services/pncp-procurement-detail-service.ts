import "server-only";
import { ProviderError } from "@/lib/http";
import { pncpProvider } from "@/providers/pncp-provider";
import type { PncpProcurementDetails } from "@/types/procurement-detail";

type Resource = keyof PncpProcurementDetails["warnings"];

const unavailable = "Dados não disponíveis na fonte neste momento.";

export async function getPncpProcurementDetails(input: {
  cnpj?: string | null;
  year?: number | null;
  sequence?: number | null;
  pncpId?: string | null;
}): Promise<PncpProcurementDetails> {
  const available = Boolean(input.pncpId && input.cnpj && input.year && input.sequence);
  if (!available) return { documents: [], minutes: [], contracts: [], history: [], warnings: {}, available: false };

  const cnpj = input.cnpj!;
  const year = input.year!;
  const sequence = input.sequence!;
  const [documents, minutes, contracts, history] = await Promise.allSettled([
    pncpProvider.getDocuments(cnpj, year, sequence),
    pncpProvider.getPriceRegistrationMinutes(cnpj, year, sequence),
    pncpProvider.getContracts(cnpj, year, sequence),
    pncpProvider.getHistory(cnpj, year, sequence),
  ]);
  const warnings: PncpProcurementDetails["warnings"] = {};
  function value<T>(resource: Resource, result: PromiseSettledResult<T[]>): T[] {
    if (result.status === "fulfilled") return result.value;
    if (result.reason instanceof ProviderError && [400, 404, 422].includes(result.reason.status)) return [];
    warnings[resource] = unavailable;
    return [];
  }

  return {
    available: true,
    warnings,
    documents: value("documents", documents).map((document) => ({
      id: String(document.sequencialDocumento), title: document.titulo,
      type: document.tipoDocumentoNome ?? null, publishedAt: document.dataPublicacaoPncp ?? null, url: document.url,
    })),
    minutes: value("minutes", minutes).map((minute) => ({
      id: minute.numeroControlePNCP ?? String(minute.sequencialAta ?? minute.numeroAtaRegistroPreco),
      number: minute.numeroAtaRegistroPreco, year: minute.anoAta ?? null,
      signedAt: minute.dataAssinatura ?? null, startsAt: minute.dataVigenciaInicio ?? null,
      endsAt: minute.dataVigenciaFim ?? null, cancelled: minute.cancelado,
      allowsAdhesion: minute.possibilidadeAdesao ?? null,
    })),
    contracts: value("contracts", contracts).map((contract) => ({
      id: contract.numeroControlePNCP, number: contract.numeroContratoEmpenho,
      type: contract.tipoContrato?.nome ?? null, object: contract.objetoContrato ?? null,
      supplier: contract.nomeRazaoSocialFornecedor ?? null, signedAt: contract.dataAssinatura ?? null,
      startsAt: contract.dataVigenciaInicio ?? null, endsAt: contract.dataVigenciaFim ?? null,
      value: contract.valorGlobal ?? null,
    })),
    history: value("history", history).map((event, index) => ({
      id: `${event.logManutencaoDataInclusao ?? "event"}-${event.documentoSequencial ?? event.itemNumero ?? index}`,
      action: event.tipoLogManutencaoNome, category: event.categoriaLogManutencaoNome,
      occurredAt: event.logManutencaoDataInclusao ?? null, name: event.documentoTitulo ?? null,
      reason: event.justificativa ?? null,
    })),
  };
}
