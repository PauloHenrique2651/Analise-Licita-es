import { z } from "zod";

const nullableText = z.string().nullable().optional();
const nullableNumber = z.number().nullable().optional();

export const pncpProcurementSchema = z.object({
  numeroControlePNCP: z.string().min(1),
  numeroCompra: nullableText,
  anoCompra: z.number().int(),
  sequencialCompra: z.number().int(),
  processo: nullableText,
  objetoCompra: z.string().min(1),
  informacaoComplementar: nullableText,
  valorTotalEstimado: nullableNumber,
  valorTotalHomologado: nullableNumber,
  modalidadeId: nullableNumber,
  modalidadeNome: nullableText,
  modoDisputaNome: nullableText,
  situacaoCompraId: nullableNumber,
  situacaoCompraNome: nullableText,
  dataPublicacaoPncp: nullableText,
  dataAberturaProposta: nullableText,
  dataEncerramentoProposta: nullableText,
  dataAtualizacao: nullableText,
  linkSistemaOrigem: nullableText,
  linkProcessoEletronico: nullableText,
  orgaoEntidade: z.object({
    cnpj: nullableText,
    razaoSocial: nullableText,
  }).passthrough().nullable().optional(),
  unidadeOrgao: z.object({
    codigoUnidade: nullableText,
    nomeUnidade: nullableText,
    codigoIbge: z.union([z.string(), z.number()]).nullable().optional(),
    municipioNome: nullableText,
    ufSigla: nullableText,
  }).passthrough().nullable().optional(),
}).passthrough();

export const pncpSearchPageSchema = z.object({
  data: z.array(pncpProcurementSchema),
  totalRegistros: z.number().int().nonnegative(),
  totalPaginas: z.number().int().nonnegative(),
  numeroPagina: z.number().int().nonnegative(),
  paginasRestantes: z.number().int().nonnegative(),
}).passthrough();

export const pncpItemSchema = z.object({
  numeroItem: z.number().int(),
  materialOuServico: nullableText,
  descricao: z.string().min(1),
  unidadeMedida: nullableText,
  quantidade: nullableNumber,
  valorUnitarioEstimado: nullableNumber,
  valorTotal: nullableNumber,
  situacaoCompraItemNome: nullableText,
  situacaoCompraItemId: nullableNumber,
  temResultado: z.boolean().nullable().optional(),
  itemClassificacaoCatalogo: nullableText,
  catalogoCodigoItem: z.union([z.string(), z.number()]).nullish().transform((value) => (value === null || value === undefined ? null : String(value))),
}).passthrough();

export const pncpItemsResponseSchema = z.union([
  z.array(pncpItemSchema),
  z.object({ itens: z.array(pncpItemSchema) }).passthrough(),
  z.object({ data: z.array(pncpItemSchema) }).passthrough(),
]).transform((response) => Array.isArray(response) ? response : "itens" in response ? response.itens : response.data);

export const pncpResultSchema = z.object({
  numeroItem: z.number().int(),
  sequencialResultado: z.number().int(),
  quantidadeHomologada: nullableNumber,
  valorUnitarioHomologado: nullableNumber,
  valorTotalHomologado: nullableNumber,
  percentualDesconto: nullableNumber,
  tipoPessoaId: z.union([z.string(), z.number()]).nullable().optional(),
  tipoPessoa: nullableText,
  niFornecedor: nullableText,
  nomeRazaoSocialFornecedor: nullableText,
  porteFornecedorNome: nullableText,
  codigoPais: nullableText,
  ordemClassificacaoSrp: nullableNumber,
  dataResultado: nullableText,
  dataCancelamento: nullableText,
  situacaoCompraItemResultadoId: nullableNumber,
  situacaoCompraItemResultadoNome: nullableText,
  dataAtualizacao: nullableText,
}).passthrough();

export const pncpResultsResponseSchema = z.union([
  z.array(pncpResultSchema),
  z.object({ listaResultados: z.array(pncpResultSchema).default([]) }).passthrough(),
  z.object({ data: z.array(pncpResultSchema).default([]) }).passthrough(),
]).transform((response) => Array.isArray(response)
  ? response
  : "listaResultados" in response ? response.listaResultados : response.data);

export const pncpModalitySchema = z.object({
  id: z.number().int().positive(),
  nome: z.string().min(1),
  descricao: z.string().nullable().optional(),
  statusAtivo: z.boolean(),
  dataAtualizacao: z.string().nullable().optional(),
}).passthrough();

export const pncpModalitiesSchema = z.array(pncpModalitySchema);

function emptyCollection<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess(
    (value) => value === "" || value === null || value === undefined ? [] : value,
    z.array(schema),
  );
}

export const pncpDocumentsSchema = emptyCollection(z.object({
  sequencialDocumento: z.number().int(),
  url: z.string().url(),
  titulo: z.string().min(1),
  tipoDocumentoNome: nullableText,
  dataPublicacaoPncp: nullableText,
}).passthrough());

export const pncpMinutesSchema = emptyCollection(z.object({
  numeroAtaRegistroPreco: z.string().min(1),
  anoAta: z.number().int().nullable().optional(),
  dataAssinatura: nullableText,
  dataVigenciaInicio: nullableText,
  dataVigenciaFim: nullableText,
  cancelado: z.boolean().optional().default(false),
  possibilidadeAdesao: z.boolean().nullable().optional(),
  sequencialAta: z.number().int().nullable().optional(),
  numeroControlePNCP: nullableText,
}).passthrough());

export const pncpContractsSchema = emptyCollection(z.object({
  numeroControlePNCP: z.string().min(1),
  numeroContratoEmpenho: z.string().min(1),
  tipoContrato: z.object({ nome: nullableText }).passthrough().nullable().optional(),
  objetoContrato: nullableText,
  nomeRazaoSocialFornecedor: nullableText,
  dataAssinatura: nullableText,
  dataVigenciaInicio: nullableText,
  dataVigenciaFim: nullableText,
  valorGlobal: nullableNumber,
}).passthrough());

export const pncpHistorySchema = emptyCollection(z.object({
  tipoLogManutencaoNome: z.string().min(1),
  categoriaLogManutencaoNome: z.string().min(1),
  logManutencaoDataInclusao: nullableText,
  documentoTitulo: nullableText,
  justificativa: nullableText,
  itemNumero: z.number().int().nullable().optional(),
  documentoSequencial: z.number().int().nullable().optional(),
}).passthrough());

export type PncpProcurementDto = z.infer<typeof pncpProcurementSchema>;
export type PncpItemDto = z.infer<typeof pncpItemSchema>;
export type PncpResultDto = z.infer<typeof pncpResultSchema>;
export type PncpModalityDto = z.infer<typeof pncpModalitySchema>;
