export type SourceTrace = {
  source: "PNCP" | "COMPRAS_GOV" | "BRASIL_API" | "SINTEGRA";
  endpoint: string;
  externalId?: string;
  importedAt: string;
};

export type PncpPage<T> = {
  data: T[];
  totalRegistros: number;
  totalPaginas: number;
  numeroPagina: number;
  paginasRestantes: number;
};

export type PncpProcurement = {
  numeroControlePNCP: string;
  numeroCompra?: string;
  anoCompra: number;
  sequencialCompra: number;
  objetoCompra: string;
  valorTotalEstimado?: number;
  valorTotalHomologado?: number;
  modalidadeNome?: string;
  situacaoCompraNome?: string;
  dataPublicacaoPncp?: string;
  orgaoEntidade?: { cnpj?: string; razaoSocial?: string };
  unidadeOrgao?: { ufSigla?: string; municipioNome?: string; nomeUnidade?: string };
};

export type BrasilApiCompany = {
  cnpj: string;
  razao_social: string;
  nome_fantasia: string | null;
  descricao_situacao_cadastral: string | null;
  descricao_porte: string | null;
  natureza_juridica: string | null;
  capital_social: number | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  municipio: string | null;
  uf: string | null;
  cnae_fiscal: number | null;
  cnae_fiscal_descricao: string | null;
  qsa?: Array<Record<string, unknown>>;
  cnaes_secundarios?: Array<{ codigo: number; descricao: string }>;
};

export type ConectaGovCompany = {
  ni: string;
  nomeEmpresarial: string;
  nomeFantasia?: string | null;
  nomefantasia?: string | null;
  situacaoCadastral?: { codigo?: string; data?: string; motivo?: string } | null;
  naturezaJuridica?: { codigo?: string; descricao?: string } | null;
  cnaePrincipal?: { codigo?: string; descricao?: string } | null;
  cnaeSecundarias?: Array<{ codigo?: string; descricao?: string }>;
  endereco?: {
    tipoLogradouro?: string;
    logradouro?: string;
    numero?: string;
    complemento?: string;
    cep?: string;
    bairro?: string;
    uf?: string;
    municipio?: { codigo?: string; descricao?: string };
  } | null;
  capitalSocial?: string;
  porte?: string;
  porteEmpresa?: string;
  [key: string]: unknown;
};

export type NormalizedCompanyLookup = {
  cnpj: string;
  legalName: string;
  tradeName: string | null;
  status: string | null;
  size: string | null;
  legalNature: string | null;
  shareCapital: number | null;
  address: {
    zipCode: string | null;
    street: string | null;
    number: string | null;
    complement: string | null;
    district: string | null;
    city: string | null;
    state: string | null;
    ibgeCode?: string | null;
  };
  primaryActivity: { code: number; description: string | null } | null;
  secondaryActivities: Array<{ codigo?: number | string; code?: string; descricao?: string; description?: string }>;
  source: {
    source: "CNPJ_CONECTA" | "BRASIL_API";
    endpoint: string;
    externalId: string;
    importedAt: string;
  };
  rawData: Record<string, unknown>;
};
