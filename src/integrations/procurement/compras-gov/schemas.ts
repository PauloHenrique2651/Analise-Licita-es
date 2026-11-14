import { z } from "zod";

const text = z.string().nullable().optional();
const number = z.number().nullable().optional();

export const comprasGovProcurementSchema = z.object({
  idCompra: z.string().min(1),
  numeroControlePNCP: text,
  anoCompraPncp: number,
  sequencialCompraPncp: number,
  orgaoEntidadeCnpj: text,
  orgaoEntidadeRazaoSocial: text,
  unidadeOrgaoCodigoUnidade: text,
  unidadeOrgaoNomeUnidade: text,
  unidadeOrgaoUfSigla: text,
  unidadeOrgaoMunicipioNome: text,
  unidadeOrgaoCodigoIbge: z.union([z.string(), z.number()]).nullable().optional(),
  numeroCompra: text,
  modalidadeIdPncp: number,
  modalidadeNome: text,
  modoDisputaNomePncp: text,
  processo: text,
  objetoCompra: z.string().min(1),
  informacaoComplementar: text,
  situacaoCompraIdPncp: number,
  situacaoCompraNomePncp: text,
  valorTotalEstimado: number,
  valorTotalHomologado: number,
  dataPublicacaoPncp: text,
  dataAberturaPropostaPncp: text,
  dataEncerramentoPropostaPncp: text,
  dataAtualizacaoPncp: text,
}).passthrough();

export const comprasGovItemSchema = z.object({
  idCompraItem: z.string().min(1),
  numeroItemPncp: number,
  descricaoResumida: text,
  descricaodetalhada: text,
  materialOuServico: text,
  codItemCatalogo: number,
  unidadeMedida: text,
  situacaoCompraItemNome: text,
  quantidade: number,
  valorUnitarioEstimado: number,
  valorTotal: number,
  temResultado: z.boolean().nullable().optional(),
  quantidadeResultado: number,
  valorUnitarioResultado: number,
  valorTotalResultado: number,
}).passthrough();

export const comprasGovResultSchema = z.object({
  idCompraItem: z.string().min(1),
  idCompra: z.string().min(1),
  idContratacaoPNCP: z.string().min(1),
  numeroItemPncp: z.number().int(),
  sequencialResultado: z.number().int(),
  niFornecedor: text,
  tipoPessoa: text,
  nomeRazaoSocialFornecedor: text,
  codigoPais: text,
  ordemClassificacaoSrp: number,
  quantidadeHomologada: number,
  valorUnitarioHomologado: number,
  valorTotalHomologado: number,
  percentualDesconto: number,
  situacaoCompraItemResultadoId: number,
  situacaoCompraItemResultadoNome: text,
  porteFornecedorNome: text,
  dataAtualizacaoPncp: text,
  dataCancelamentoPncp: text,
  dataResultadoPncp: text,
}).passthrough();

function pageSchema<T extends z.ZodTypeAny>(record: T) {
  return z.object({
    resultado: z.array(record).default([]),
    totalRegistros: z.number().int().nonnegative().default(0),
    totalPaginas: z.number().int().nonnegative().default(0),
    paginasRestantes: z.number().int().nonnegative().default(0),
  }).passthrough();
}

export const comprasGovProcurementPageSchema = pageSchema(comprasGovProcurementSchema);
export const comprasGovItemPageSchema = pageSchema(comprasGovItemSchema);
export const comprasGovResultPageSchema = pageSchema(comprasGovResultSchema);

export type ComprasGovProcurementDto = z.infer<typeof comprasGovProcurementSchema>;
export type ComprasGovItemDto = z.infer<typeof comprasGovItemSchema>;
export type ComprasGovResultDto = z.infer<typeof comprasGovResultSchema>;
