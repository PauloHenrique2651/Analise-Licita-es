export type ProcurementApiProviderSlug = "PNCP" | "COMPRAS_GOV";
export type ProviderSlug = ProcurementApiProviderSlug | "RJ_DADOS_ABERTOS_SIGA";

export type ProcurementFetchParams = {
  startDate: string;
  endDate: string;
  modalityCode: number;
  page?: number;
  pageSize?: number;
  state?: string;
  cityIbgeCode?: string;
};

export type NormalizedProcurementResult = {
  externalId: string;
  pncpId: string;
  itemNumber: number;
  sequence: number;
  supplierDocument?: string;
  supplierName?: string;
  supplierCountry?: string;
  supplierPersonType?: string;
  supplierSize?: string;
  quantity?: number;
  unitValue?: number;
  totalValue?: number;
  discountPercent?: number;
  classificationOrder?: number;
  resultDate?: string;
  statusCode?: number;
  status?: string;
  cancelledAt?: string;
  sourceUpdatedAt?: string;
  sourceEndpoint: string;
  winner: boolean;
  rawData: Record<string, unknown>;
};

export type NormalizedProcurementItem = {
  externalId?: string;
  itemNumber?: number;
  description: string;
  materialCode?: string;
  serviceCode?: string;
  quantity?: number;
  unit?: string;
  estimatedUnitValue?: number;
  estimatedTotalValue?: number;
  homologatedTotalValue?: number;
  status?: string;
  hasResult?: boolean;
  rawData: Record<string, unknown>;
};

export type NormalizedProcurement = {
  externalId: string;
  source: ProviderSlug;
  sourcePortalName: string;
  sourceUrl?: string;
  sourceEndpoint: string;
  pncpId?: string;
  purchaseNumber?: string;
  purchaseYear?: number;
  sequenceNumber?: number;
  processNumber?: string;
  noticeNumber?: string;
  object: string;
  description?: string;
  modalityCode?: number;
  modality?: string;
  disputeMode?: string;
  statusCode?: number;
  status?: string;
  agencyName?: string;
  agencyCnpj?: string;
  unitName?: string;
  unitCode?: string;
  state?: string;
  city?: string;
  cityIbgeCode?: string;
  publishedAt?: string;
  proposalStartAt?: string;
  proposalEndAt?: string;
  openingAt?: string;
  sourceUpdatedAt?: string;
  estimatedValue?: number;
  homologatedValue?: number;
  editalUrl?: string;
  items: NormalizedProcurementItem[];
  results?: NormalizedProcurementResult[];
  rawData: Record<string, unknown>;
};

export type ProcurementPage = {
  records: NormalizedProcurement[];
  page: number;
  totalPages: number;
  totalRecords: number;
  remainingPages: number;
};

export interface ProcurementProvider {
  readonly name: string;
  readonly slug: ProviderSlug;
  fetchProcurements(params: ProcurementFetchParams): Promise<ProcurementPage>;
  fetchItems?(procurement: NormalizedProcurement): Promise<NormalizedProcurementItem[]>;
  fetchResults?(procurement: NormalizedProcurement): Promise<NormalizedProcurementResult[]>;
  fetchProcurementById?(externalId: string): Promise<NormalizedProcurement | null>;
}

export type ProcurementSearchFilters = {
  text?: string;
  state?: string;
  city?: string;
  /** Município por código IBGE (exato). Preferir a `city` (texto livre). */
  cityIbge?: string;
  agency?: string;
  agencyCnpj?: string;
  modality?: string;
  portal?: string;
  status?: string;
  publishedFrom?: string;
  publishedTo?: string;
  proposalUntil?: string;
  minValue?: number;
  maxValue?: number;
  /** Modo de disputa do PNCP (ex.: "Aberto", "Aberto-Fechado", "Fechado", "Dispensa Com Disputa"). */
  disputeMode?: string;
  /** "exclusiva" = todos os itens exclusivos ME/EPP; "com_beneficio" = exclusiva ou cota; "sem" = sem benefício. */
  meEpp?: "exclusiva" | "com_beneficio" | "sem";
  itemKind?: "material" | "servico";
  openOnly?: boolean;
  limit?: number;
  offset?: number;
};
