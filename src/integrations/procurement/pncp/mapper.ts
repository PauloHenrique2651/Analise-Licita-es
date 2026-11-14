import { buildPncpPublicUrl, cleanNationalId, cleanText, finiteNumber, isoDate } from "../normalize";
import type { NormalizedProcurement, NormalizedProcurementItem, NormalizedProcurementResult } from "../types";
import type { PncpItemDto, PncpProcurementDto, PncpResultDto } from "./schemas";

export function mapPncpItem(item: PncpItemDto, pncpId: string): NormalizedProcurementItem {
  // O PNCP envia o código CATMAT/CATSER em `catalogoCodigoItem`; `itemClassificacaoCatalogo` é só a classificação.
  const catalog = cleanText(item.catalogoCodigoItem) ?? cleanText(item.itemClassificacaoCatalogo);
  const material = item.materialOuServico === "M" ? catalog : undefined;
  const service = item.materialOuServico === "S" ? catalog : undefined;
  return {
    externalId: `${pncpId}:${item.numeroItem}`,
    itemNumber: item.numeroItem,
    description: item.descricao,
    materialCode: material,
    serviceCode: service,
    quantity: finiteNumber(item.quantidade),
    unit: cleanText(item.unidadeMedida),
    estimatedUnitValue: finiteNumber(item.valorUnitarioEstimado),
    estimatedTotalValue: finiteNumber(item.valorTotal),
    status: cleanText(item.situacaoCompraItemNome),
    hasResult: item.temResultado ?? finiteNumber(item.situacaoCompraItemId) === 2,
    rawData: item,
  };
}

export function mapPncpResult(result: PncpResultDto, pncpId: string, endpoint: string): NormalizedProcurementResult {
  const statusCode = finiteNumber(result.situacaoCompraItemResultadoId);
  const cancelledAt = isoDate(result.dataCancelamento);
  return {
    externalId: `${pncpId}:${result.numeroItem}:${result.sequencialResultado}`,
    pncpId,
    itemNumber: result.numeroItem,
    sequence: result.sequencialResultado,
    supplierDocument: cleanNationalId(result.niFornecedor),
    supplierName: cleanText(result.nomeRazaoSocialFornecedor),
    supplierCountry: cleanText(result.codigoPais),
    supplierPersonType: cleanText(result.tipoPessoa ?? (result.tipoPessoaId === null || result.tipoPessoaId === undefined ? undefined : String(result.tipoPessoaId))),
    supplierSize: cleanText(result.porteFornecedorNome),
    quantity: finiteNumber(result.quantidadeHomologada),
    unitValue: finiteNumber(result.valorUnitarioHomologado),
    totalValue: finiteNumber(result.valorTotalHomologado),
    discountPercent: finiteNumber(result.percentualDesconto),
    classificationOrder: finiteNumber(result.ordemClassificacaoSrp),
    resultDate: isoDate(result.dataResultado),
    statusCode,
    status: cleanText(result.situacaoCompraItemResultadoNome),
    cancelledAt,
    sourceUpdatedAt: isoDate(result.dataAtualizacao),
    sourceEndpoint: endpoint,
    winner: statusCode !== 2 && !cancelledAt,
    rawData: result,
  };
}

export function mapPncpProcurement(dto: PncpProcurementDto, endpoint: string): NormalizedProcurement {
  const agencyCnpj = cleanNationalId(dto.orgaoEntidade?.cnpj);
  const officialUrl = buildPncpPublicUrl(agencyCnpj, dto.anoCompra, dto.sequencialCompra);
  return {
    externalId: dto.numeroControlePNCP,
    source: "PNCP",
    sourcePortalName: "Portal Nacional de Contratações Públicas",
    sourceUrl: cleanText(dto.linkSistemaOrigem) ?? cleanText(dto.linkProcessoEletronico) ?? officialUrl,
    sourceEndpoint: endpoint,
    pncpId: dto.numeroControlePNCP,
    purchaseNumber: cleanText(dto.numeroCompra),
    purchaseYear: dto.anoCompra,
    sequenceNumber: dto.sequencialCompra,
    processNumber: cleanText(dto.processo),
    object: dto.objetoCompra,
    description: cleanText(dto.informacaoComplementar),
    modalityCode: finiteNumber(dto.modalidadeId),
    modality: cleanText(dto.modalidadeNome),
    disputeMode: cleanText(dto.modoDisputaNome),
    statusCode: finiteNumber(dto.situacaoCompraId),
    status: cleanText(dto.situacaoCompraNome),
    agencyName: cleanText(dto.orgaoEntidade?.razaoSocial),
    agencyCnpj,
    unitName: cleanText(dto.unidadeOrgao?.nomeUnidade),
    unitCode: cleanText(dto.unidadeOrgao?.codigoUnidade),
    state: cleanText(dto.unidadeOrgao?.ufSigla)?.toUpperCase(),
    city: cleanText(dto.unidadeOrgao?.municipioNome),
    cityIbgeCode: dto.unidadeOrgao?.codigoIbge ? String(dto.unidadeOrgao.codigoIbge).padStart(7, "0") : undefined,
    publishedAt: isoDate(dto.dataPublicacaoPncp),
    proposalStartAt: isoDate(dto.dataAberturaProposta),
    proposalEndAt: isoDate(dto.dataEncerramentoProposta),
    sourceUpdatedAt: isoDate(dto.dataAtualizacao),
    estimatedValue: finiteNumber(dto.valorTotalEstimado),
    homologatedValue: finiteNumber(dto.valorTotalHomologado),
    editalUrl: officialUrl,
    items: [],
    rawData: dto,
  };
}
