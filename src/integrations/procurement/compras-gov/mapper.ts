import { buildPncpPublicUrl, cleanNationalId, cleanText, finiteNumber, isoDate } from "../normalize";
import type { NormalizedProcurement, NormalizedProcurementItem, NormalizedProcurementResult } from "../types";
import type { ComprasGovItemDto, ComprasGovProcurementDto, ComprasGovResultDto } from "./schemas";

export function mapComprasGovItem(item: ComprasGovItemDto): NormalizedProcurementItem {
  const catalogCode = finiteNumber(item.codItemCatalogo)?.toString();
  const description = cleanText(item.descricaodetalhada) ?? cleanText(item.descricaoResumida) ?? "Descrição não fornecida pela fonte";
  return {
    externalId: item.idCompraItem,
    itemNumber: finiteNumber(item.numeroItemPncp),
    description,
    materialCode: item.materialOuServico === "M" ? catalogCode : undefined,
    serviceCode: item.materialOuServico === "S" ? catalogCode : undefined,
    quantity: finiteNumber(item.quantidade),
    unit: cleanText(item.unidadeMedida),
    estimatedUnitValue: finiteNumber(item.valorUnitarioEstimado),
    estimatedTotalValue: finiteNumber(item.valorTotal),
    homologatedTotalValue: finiteNumber(item.valorTotalResultado),
    status: cleanText(item.situacaoCompraItemNome),
    hasResult: item.temResultado ?? /homolog/i.test(item.situacaoCompraItemNome ?? ""),
    rawData: item,
  };
}

export function mapComprasGovResult(result: ComprasGovResultDto, endpoint: string): NormalizedProcurementResult {
  const statusCode = finiteNumber(result.situacaoCompraItemResultadoId);
  const cancelledAt = isoDate(result.dataCancelamentoPncp);
  return {
    externalId: `${result.idContratacaoPNCP}:${result.numeroItemPncp}:${result.sequencialResultado}`,
    pncpId: result.idContratacaoPNCP,
    itemNumber: result.numeroItemPncp,
    sequence: result.sequencialResultado,
    supplierDocument: cleanNationalId(result.niFornecedor),
    supplierName: cleanText(result.nomeRazaoSocialFornecedor),
    supplierCountry: cleanText(result.codigoPais),
    supplierPersonType: cleanText(result.tipoPessoa),
    supplierSize: cleanText(result.porteFornecedorNome),
    quantity: finiteNumber(result.quantidadeHomologada),
    unitValue: finiteNumber(result.valorUnitarioHomologado),
    totalValue: finiteNumber(result.valorTotalHomologado),
    discountPercent: finiteNumber(result.percentualDesconto),
    classificationOrder: finiteNumber(result.ordemClassificacaoSrp),
    resultDate: isoDate(result.dataResultadoPncp),
    statusCode,
    status: cleanText(result.situacaoCompraItemResultadoNome),
    cancelledAt,
    sourceUpdatedAt: isoDate(result.dataAtualizacaoPncp),
    sourceEndpoint: endpoint,
    winner: statusCode !== 2 && !cancelledAt,
    rawData: result,
  };
}

export function mapComprasGovProcurement(dto: ComprasGovProcurementDto, endpoint: string): NormalizedProcurement {
  const cnpj = cleanNationalId(dto.orgaoEntidadeCnpj);
  const year = finiteNumber(dto.anoCompraPncp);
  const sequence = finiteNumber(dto.sequencialCompraPncp);
  const sourceUrl = buildPncpPublicUrl(cnpj, year, sequence);
  return {
    externalId: dto.idCompra,
    source: "COMPRAS_GOV",
    sourcePortalName: "Compras.gov.br",
    sourceUrl,
    sourceEndpoint: endpoint,
    pncpId: cleanText(dto.numeroControlePNCP),
    purchaseNumber: cleanText(dto.numeroCompra),
    purchaseYear: year,
    sequenceNumber: sequence,
    processNumber: cleanText(dto.processo),
    object: dto.objetoCompra,
    description: cleanText(dto.informacaoComplementar),
    modalityCode: finiteNumber(dto.modalidadeIdPncp),
    modality: cleanText(dto.modalidadeNome),
    disputeMode: cleanText(dto.modoDisputaNomePncp),
    statusCode: finiteNumber(dto.situacaoCompraIdPncp),
    status: cleanText(dto.situacaoCompraNomePncp),
    agencyName: cleanText(dto.orgaoEntidadeRazaoSocial),
    agencyCnpj: cnpj,
    unitName: cleanText(dto.unidadeOrgaoNomeUnidade),
    unitCode: cleanText(dto.unidadeOrgaoCodigoUnidade),
    state: cleanText(dto.unidadeOrgaoUfSigla)?.toUpperCase(),
    city: cleanText(dto.unidadeOrgaoMunicipioNome),
    cityIbgeCode: dto.unidadeOrgaoCodigoIbge ? String(dto.unidadeOrgaoCodigoIbge).padStart(7, "0") : undefined,
    publishedAt: isoDate(dto.dataPublicacaoPncp),
    proposalStartAt: isoDate(dto.dataAberturaPropostaPncp),
    proposalEndAt: isoDate(dto.dataEncerramentoPropostaPncp),
    sourceUpdatedAt: isoDate(dto.dataAtualizacaoPncp),
    estimatedValue: finiteNumber(dto.valorTotalEstimado),
    homologatedValue: finiteNumber(dto.valorTotalHomologado),
    editalUrl: sourceUrl,
    items: [],
    rawData: dto,
  };
}
