import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildSearchText, normalizeDescription, normalizeItems } from "@/integrations/procurement/normalize";
import { getDeduplicationKeys } from "@/integrations/procurement/deduplicate";
import type { NormalizedProcurement, NormalizedProcurementResult, ProcurementSearchFilters, ProviderSlug } from "@/integrations/procurement/types";

type SourceRecord = { id: string; priority: number };
type ExistingProcurement = { id: string; source_id: string; canonical_key: string | null };

export class ProcurementRepository {
  private readonly client: SupabaseClient;
  private readonly sourceCache = new Map<ProviderSlug, SourceRecord>();

  constructor(client: SupabaseClient = createAdminClient()) {
    this.client = client;
  }

  async getSource(code: ProviderSlug) {
    const cached = this.sourceCache.get(code);
    if (cached) return cached;
    const { data, error } = await this.client.from("sources").select("id, priority").eq("code", code).single();
    if (error || !data) throw error ?? new Error(`Fonte ${code} não cadastrada.`);
    const source = { id: data.id as string, priority: Number(data.priority ?? 100) };
    this.sourceCache.set(code, source);
    return source;
  }

  private async existingSourcePriority(sourceId: string) {
    const { data } = await this.client.from("sources").select("priority").eq("id", sourceId).maybeSingle();
    return Number(data?.priority ?? 100);
  }

  private async findExisting(procurement: NormalizedProcurement, sourceId: string) {
    const keys = getDeduplicationKeys(procurement);
    if (keys.pncpId) {
      const { data } = await this.client.from("procurements").select("id, source_id, canonical_key").eq("pncp_id", keys.pncpId).maybeSingle();
      if (data) return data as ExistingProcurement;
    }

    const { data: sourceMatch } = await this.client
      .from("procurement_sources")
      .select("procurement_id")
      .eq("source_id", sourceId)
      .eq("external_id", procurement.externalId)
      .maybeSingle();
    if (sourceMatch?.procurement_id) {
      const { data } = await this.client.from("procurements").select("id, source_id, canonical_key").eq("id", sourceMatch.procurement_id).single();
      if (data) return data as ExistingProcurement;
    }

    const candidates = [keys.canonical, keys.agencyPurchaseYear, keys.process, keys.agencyNotice].filter(Boolean) as string[];
    if (candidates.length) {
      const { data } = await this.client.from("procurements").select("id, source_id, canonical_key").in("canonical_key", candidates).limit(1).maybeSingle();
      if (data) return data as ExistingProcurement;
    }

    if (procurement.agencyCnpj && procurement.purchaseNumber && procurement.purchaseYear) {
      const { data } = await this.client.from("procurements")
        .select("id, source_id, canonical_key")
        .eq("agency_cnpj", procurement.agencyCnpj)
        .eq("purchase_number", procurement.purchaseNumber)
        .eq("purchase_year", procurement.purchaseYear)
        .limit(1)
        .maybeSingle();
      if (data) return data as ExistingProcurement;
    }

    if (procurement.processNumber) {
      let query = this.client.from("procurements").select("id, source_id, canonical_key").eq("process_number", procurement.processNumber);
      if (procurement.agencyCnpj) query = query.eq("agency_cnpj", procurement.agencyCnpj);
      const { data } = await query.limit(1).maybeSingle();
      if (data) return data as ExistingProcurement;
    }
    return null;
  }

  private async upsertOrganization(procurement: NormalizedProcurement, sourceId: string) {
    const externalId = [procurement.agencyCnpj ?? "sem-cnpj", procurement.unitCode ?? procurement.unitName ?? procurement.agencyName ?? "orgao"].join(":");
    const cityCode = procurement.cityIbgeCode?.length === 7 && procurement.state?.length === 2 && procurement.city
      ? procurement.cityIbgeCode
      : null;
    if (cityCode) {
      const { error: cityError } = await this.client.from("cities").upsert({
        ibge_code: cityCode,
        state_code: procurement.state,
        name: procurement.city,
      }, { onConflict: "ibge_code", ignoreDuplicates: true });
      // Só cadastra o município se ainda não existir: o nome oficial vem do IBGE (sync-geography) e a grafia da fonte
      // (geralmente em maiúsculas) não pode sobrescrevê-lo.
      if (cityError) throw cityError;
    }
    const { data, error } = await this.client.from("organizations").upsert({
      cnpj: procurement.agencyCnpj ?? null,
      legal_name: procurement.agencyName ?? "Órgão não informado pela fonte",
      unit_code: procurement.unitCode ?? null,
      unit_name: procurement.unitName ?? null,
      city_ibge_code: cityCode,
      state_code: procurement.state?.length === 2 ? procurement.state : null,
      source_id: sourceId,
      external_id: externalId,
      source_endpoint: procurement.sourceEndpoint,
      imported_at: new Date().toISOString(),
      source_updated_at: procurement.sourceUpdatedAt ?? null,
    }, { onConflict: "source_id,external_id" }).select("id").single();
    if (error || !data) throw error ?? new Error("Falha ao persistir órgão comprador.");
    return data.id as string;
  }

  private async ensureItemProduct(item: { id: string; product_id: string | null; original_description: string; normalized_description: string | null; catalog_item_code: string | null; raw_data: unknown }) {
    if (item.product_id) return item.product_id;
    const raw = item.raw_data && typeof item.raw_data === "object" ? item.raw_data as Record<string, unknown> : {};
    const marker = String(raw.materialOuServico ?? raw.tipo_item ?? "").toUpperCase();
    const productType = marker === "M" ? "material" : marker === "S" ? "service" : "unknown";
    const normalized = item.normalized_description || normalizeDescription(item.original_description);
    let query = this.client.from("products").select("id").eq("product_type", productType);
    if (item.catalog_item_code && productType === "material") query = query.eq("catmat_code", item.catalog_item_code);
    else if (item.catalog_item_code && productType === "service") query = query.eq("catser_code", item.catalog_item_code);
    else query = query.eq("normalized_description", normalized);
    const { data: existing, error: lookupError } = await query.limit(1).maybeSingle();
    if (lookupError) throw lookupError;
    let productId = existing?.id as string | undefined;
    if (!productId) {
      const { data: product, error } = await this.client.from("products").insert({
        product_type: productType,
        normalized_description: normalized,
        grouped_name: item.original_description,
        catmat_code: productType === "material" ? item.catalog_item_code : null,
        catser_code: productType === "service" ? item.catalog_item_code : null,
        match_status: item.catalog_item_code ? "confirmed" : "needs_validation",
        match_confidence: item.catalog_item_code ? 1 : null,
      }).select("id").single();
      if (error || !product) throw error ?? new Error("Falha ao classificar produto homologado.");
      productId = product.id as string;
    }
    const { error: linkError } = await this.client.from("procurement_items").update({ product_id: productId }).eq("id", item.id);
    if (linkError) throw linkError;
    return productId;
  }

  /** true quando a licitação já está no banco com a mesma data de atualização na fonte e com itens: dá para pular a busca de itens. */
  async isUnchanged(procurement: NormalizedProcurement) {
    const source = await this.getSource(procurement.source);
    const { data } = await this.client
      .from("procurement_sources")
      .select("procurement_id, source_updated_at")
      .eq("source_id", source.id)
      .eq("external_id", procurement.externalId)
      .maybeSingle();
    if (!data?.procurement_id) return false;
    const same = (data.source_updated_at ?? null) === null
      ? !procurement.sourceUpdatedAt
      : Boolean(procurement.sourceUpdatedAt) && new Date(data.source_updated_at as string).getTime() === new Date(procurement.sourceUpdatedAt!).getTime();
    if (!same) return false;
    const { count } = await this.client.from("procurement_items").select("id", { count: "exact", head: true }).eq("procurement_id", data.procurement_id);
    return (count ?? 0) > 0;
  }

  async save(procurement: NormalizedProcurement) {
    const source = await this.getSource(procurement.source);
    const organizationId = await this.upsertOrganization(procurement, source.id);
    const existing = await this.findExisting(procurement, source.id);
    const keys = getDeduplicationKeys(procurement);
    const items = normalizeItems(procurement.items);
    const existingPriority = existing ? await this.existingSourcePriority(existing.source_id) : Number.POSITIVE_INFINITY;
    const isPrimary = !existing || source.priority <= existingPriority;
    const now = new Date().toISOString();

    const payload = {
      organization_id: organizationId,
      control_number: procurement.pncpId ?? procurement.externalId,
      process_number: procurement.processNumber ?? null,
      purchase_number: procurement.purchaseNumber ?? null,
      purchase_year: procurement.purchaseYear ?? null,
      sequence_number: procurement.sequenceNumber ?? null,
      modality_code: procurement.modalityCode ?? null,
      modality_name: procurement.modality ?? null,
      status_code: procurement.statusCode ?? null,
      status_name: procurement.status ?? null,
      object_description: procurement.object,
      published_at: procurement.publishedAt ?? null,
      proposal_start_at: procurement.proposalStartAt ?? null,
      proposal_end_at: procurement.proposalEndAt ?? null,
      estimated_value: procurement.estimatedValue ?? null,
      homologated_value: procurement.homologatedValue ?? null,
      source_id: source.id,
      source_endpoint: procurement.sourceEndpoint,
      external_id: procurement.externalId,
      imported_at: now,
      source_updated_at: procurement.sourceUpdatedAt ?? null,
      raw_data: procurement.rawData,
      canonical_key: keys.pncpId ? keys.canonical : existing?.canonical_key ?? keys.canonical,
      source_portal_name: procurement.sourcePortalName,
      source_url: procurement.sourceUrl ?? null,
      pncp_id: procurement.pncpId ?? null,
      notice_number: procurement.noticeNumber ?? null,
      description: procurement.description ?? null,
      dispute_mode: procurement.disputeMode ?? null,
      agency_name: procurement.agencyName ?? null,
      agency_cnpj: procurement.agencyCnpj ?? null,
      unit_name: procurement.unitName ?? null,
      unit_code: procurement.unitCode ?? null,
      state_code: procurement.state?.length === 2 ? procurement.state : null,
      city_name: procurement.city ?? null,
      opening_at: procurement.openingAt ?? null,
      edital_url: procurement.editalUrl ?? null,
      search_text: buildSearchText(procurement, items),
      updated_at: now,
    };

    let procurementId = existing?.id;
    if (!existing) {
      const { data, error } = await this.client.from("procurements").insert(payload).select("id").single();
      if (error || !data) throw error ?? new Error("Falha ao inserir licitação.");
      procurementId = data.id as string;
    } else if (isPrimary) {
      const { error } = await this.client.from("procurements").update(payload).eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await this.client.from("procurements").update({
        updated_at: now,
      }).eq("id", existing.id);
      if (error) throw error;
    }
    if (!procurementId) throw new Error("Licitação não foi persistida.");

    let shouldSaveItems = isPrimary;
    if (!isPrimary && items.length) {
      const { count, error } = await this.client.from("procurement_items")
        .select("id", { count: "exact", head: true })
        .eq("procurement_id", procurementId);
      if (error) throw error;
      shouldSaveItems = (count ?? 0) === 0;
      if (shouldSaveItems) {
        const { error: searchError } = await this.client.from("procurements")
          .update({ search_text: buildSearchText(procurement, items), updated_at: now })
          .eq("id", procurementId);
        if (searchError) throw searchError;
      }
    }

    if (isPrimary) {
      const { error } = await this.client.from("procurement_sources").update({ is_primary: false }).eq("procurement_id", procurementId);
      if (error) throw error;
    }
    const { error: sourceError } = await this.client.from("procurement_sources").upsert({
      procurement_id: procurementId,
      source_id: source.id,
      external_id: procurement.externalId,
      source_url: procurement.sourceUrl ?? null,
      source_endpoint: procurement.sourceEndpoint,
      is_primary: isPrimary,
      raw_data: procurement.rawData,
      imported_at: now,
      source_updated_at: procurement.sourceUpdatedAt ?? null,
    }, { onConflict: "source_id,external_id" });
    if (sourceError) throw sourceError;

    if (shouldSaveItems && items.length) {
      const rows = items.map((item, index) => ({
        procurement_id: procurementId,
        product_id: null,
        item_number: item.itemNumber ?? index + 1,
        original_description: item.description,
        normalized_description: normalizeDescription(item.description),
        unit: item.unit ?? null,
        quantity: item.quantity ?? null,
        estimated_unit_value: item.estimatedUnitValue ?? null,
        estimated_total_value: item.estimatedTotalValue ?? null,
        homologated_total_value: item.homologatedTotalValue ?? null,
        status_name: item.status ?? null,
        has_result: item.hasResult ?? false,
        catalog_item_code: item.materialCode ?? item.serviceCode ?? null,
        source_id: source.id,
        source_endpoint: procurement.sourceEndpoint,
        external_id: item.externalId ?? `${procurement.externalId}:${item.itemNumber ?? index + 1}`,
        imported_at: now,
        raw_data: item.rawData,
      }));
      const { error } = await this.client.from("procurement_items").upsert(rows, { onConflict: "procurement_id,item_number" });
      if (error) throw error;
    }

    return { id: procurementId, inserted: !existing, primarySource: isPrimary };
  }

  async hasProcurement(pncpId: string) {
    const { data, error } = await this.client.from("procurements").select("id").eq("pncp_id", pncpId).maybeSingle();
    if (error) throw error;
    return Boolean(data?.id);
  }

  async saveResults(provider: ProviderSlug, results: NormalizedProcurementResult[]) {
    const source = await this.getSource(provider);
    const now = new Date().toISOString();
    let inserted = 0;
    let updated = 0;
    let deferred = 0;
    const procurementCache = new Map<string, { id: string; organizationId: string; stateCode: string | null } | null>();
    const itemTotals = new Map<string, { total: number; hasValue: boolean }>();

    for (const result of results) {
      let procurement = procurementCache.get(result.pncpId);
      if (procurement === undefined) {
        const { data, error } = await this.client.from("procurements")
          .select("id, organization_id, state_code")
          .eq("pncp_id", result.pncpId)
          .maybeSingle();
        if (error) throw error;
        procurement = data ? {
          id: data.id as string,
          organizationId: data.organization_id as string,
          stateCode: data.state_code as string | null,
        } : null;
        procurementCache.set(result.pncpId, procurement);
      }
      if (!procurement) { deferred += 1; continue; }

      const { data: item, error: itemError } = await this.client.from("procurement_items")
        .select("id, product_id, unit, original_description, normalized_description, catalog_item_code, raw_data")
        .eq("procurement_id", procurement.id)
        .eq("item_number", result.itemNumber)
        .maybeSingle();
      if (itemError) throw itemError;
      if (!item) { deferred += 1; continue; }
      const productId = await this.ensureItemProduct(item as {
        id: string; product_id: string | null; original_description: string; normalized_description: string | null;
        catalog_item_code: string | null; raw_data: unknown;
      });

      if (!result.supplierDocument || !result.supplierName) { deferred += 1; continue; }
      let supplierId: string | undefined;
      const { data: knownSupplier, error: supplierLookupError } = await this.client.from("suppliers")
        .select("id")
        .eq("cnpj_cpf", result.supplierDocument)
        .limit(1)
        .maybeSingle();
      if (supplierLookupError) throw supplierLookupError;
      supplierId = knownSupplier?.id as string | undefined;
      if (!supplierId) {
        const supplierExternalId = `${result.supplierCountry ?? "BR"}:${result.supplierDocument}`;
        const { data: supplier, error: supplierError } = await this.client.from("suppliers").upsert({
          cnpj_cpf: result.supplierDocument,
          legal_name: result.supplierName,
          source_id: source.id,
          external_id: supplierExternalId,
          source_endpoint: result.sourceEndpoint,
          imported_at: now,
          source_updated_at: result.sourceUpdatedAt ?? null,
        }, { onConflict: "source_id,external_id" }).select("id").single();
        if (supplierError || !supplier) throw supplierError ?? new Error("Falha ao persistir fornecedor vencedor.");
        supplierId = supplier.id as string;
      }

      const { data: equivalent, error: equivalentError } = await this.client.from("results")
        .select("id, source_id")
        .eq("procurement_item_id", item.id)
        .eq("supplier_id", supplierId)
        .eq("result_sequence", result.sequence)
        .limit(1)
        .maybeSingle();
      if (equivalentError) throw equivalentError;
      const resultPayload = {
        procurement_item_id: item.id,
        supplier_id: supplierId,
        result_sequence: result.sequence,
        quantity_homologated: result.quantity ?? null,
        unit_value: result.unitValue ?? null,
        total_value: result.totalValue ?? null,
        winner: result.winner,
        source_id: source.id,
        source_endpoint: result.sourceEndpoint,
        external_id: result.externalId,
        imported_at: now,
        source_updated_at: result.sourceUpdatedAt ?? null,
        raw_data: result.rawData,
      };
      if (equivalent) {
        const currentPriority = await this.existingSourcePriority(equivalent.source_id as string);
        if (source.priority <= currentPriority) {
          const { error } = await this.client.from("results").update(resultPayload).eq("id", equivalent.id);
          if (error) throw error;
          updated += 1;
        }
      } else {
        const { error } = await this.client.from("results").upsert(resultPayload, { onConflict: "source_id,external_id" });
        if (error) throw error;
        inserted += 1;
      }

      if (result.winner && result.unitValue !== undefined && result.resultDate) {
        const { error } = await this.client.from("price_records").upsert({
          product_id: productId,
          procurement_item_id: item.id,
          supplier_id: supplierId,
          organization_id: procurement.organizationId,
          state_code: procurement.stateCode,
          observed_at: result.resultDate.slice(0, 10),
          unit: item.unit ?? null,
          quantity: result.quantity ?? null,
          unit_price: result.unitValue,
          source_id: source.id,
          source_endpoint: result.sourceEndpoint,
          external_id: result.externalId,
          imported_at: now,
        }, { onConflict: "source_id,external_id" });
        if (error) throw error;
      }
      const total = itemTotals.get(item.id) ?? { total: 0, hasValue: false };
      if (result.winner && result.totalValue !== undefined) {
        total.total += result.totalValue;
        total.hasValue = true;
      }
      itemTotals.set(item.id, total);
    }

    for (const [itemId, total] of itemTotals) {
      const { error } = await this.client.from("procurement_items").update({
        has_result: true,
        homologated_total_value: total.hasValue ? total.total : null,
      }).eq("id", itemId);
      if (error) throw error;
    }
    return { inserted, updated, deferred };
  }

  async markSyncStarted(provider: string, metadata: Record<string, unknown>) {
    const now = new Date().toISOString();
    const { error } = await this.client.from("procurement_sync_state").upsert({
      provider,
      last_sync_at: now,
      last_error: null,
      metadata,
      updated_at: now,
    }, { onConflict: "provider" });
    if (error) throw error;
  }

  async markSyncProgress(provider: string, page: number, cursor: string, metadata: Record<string, unknown>) {
    const { error } = await this.client.from("procurement_sync_state").update({
      last_page: page,
      last_cursor: cursor,
      metadata,
      updated_at: new Date().toISOString(),
    }).eq("provider", provider);
    if (error) throw error;
  }

  async markSyncSucceeded(provider: string, metadata: Record<string, unknown>) {
    const now = new Date().toISOString();
    const { error } = await this.client.from("procurement_sync_state").update({
      last_success_at: now,
      last_error: null,
      consecutive_failures: 0,
      metadata,
      updated_at: now,
    }).eq("provider", provider);
    if (error) throw error;
  }

  async markSyncFailed(provider: string, error: unknown, metadata: Record<string, unknown>) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Falha desconhecida";
    const { data } = await this.client.from("procurement_sync_state").select("consecutive_failures").eq("provider", provider).maybeSingle();
    await this.client.from("procurement_sync_state").update({
      last_error: message,
      consecutive_failures: Number(data?.consecutive_failures ?? 0) + 1,
      metadata,
      updated_at: new Date().toISOString(),
    }).eq("provider", provider);
  }
}

/** Campo de formulário em branco não é filtro: vira null (data vazia quebrava a busca com erro de conversão). */
const blank = <T,>(value: T | null | undefined): T | null => (value === undefined || value === null || (typeof value === "string" && value.trim() === "") ? null : value);

export function toSearchRpcParams(filters: ProcurementSearchFilters) {
  return {
    p_text: blank(filters.text),
    p_state: blank(filters.state),
    p_city: blank(filters.city),
    p_agency: blank(filters.agency),
    p_agency_cnpj: blank(filters.agencyCnpj),
    p_modality: blank(filters.modality),
    p_source_code: blank(filters.portal),
    p_status: blank(filters.status),
    p_published_from: blank(filters.publishedFrom),
    p_published_to: blank(filters.publishedTo),
    p_proposal_until: blank(filters.proposalUntil),
    p_min_value: filters.minValue ?? null,
    p_max_value: filters.maxValue ?? null,
    p_limit: Math.min(filters.limit ?? 50, 100),
    p_offset: Math.max(filters.offset ?? 0, 0),
    p_dispute_mode: blank(filters.disputeMode),
    p_me_epp: blank(filters.meEpp),
    p_item_kind: blank(filters.itemKind),
    p_open_only: filters.openOnly ?? false,
    p_city_ibge: blank(filters.cityIbge),
  };
}
