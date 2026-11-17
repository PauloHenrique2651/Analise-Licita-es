import "server-only";
import { createClient } from "@/lib/supabase/server";
import { toSearchRpcParams } from "@/repositories/procurement-repository";
import type { ProcurementSearchFilters } from "@/integrations/procurement/types";

export type AnalysisTable = {
  columns: Array<{ key: string; label: string; format?: "currency" | "number" | "date" | "external" }>;
  rows: Array<Record<string, string | number | null>>;
  message: string | null;
};

const empty = (message = "Nenhum registro corresponde à pesquisa."): AnalysisTable => ({ columns: [], rows: [], message });

function externalUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try { return ["http:", "https:"].includes(new URL(value).protocol) ? value : null; } catch { return null; }
}

const PORTAL_LABELS: Record<string, string> = { PNCP: "PNCP", COMPRAS_GOV: "Compras.gov.br", RJ_DADOS_ABERTOS_SIGA: "SIGA/RJ" };
/** Todos os portais em que a licitação aparece ("PNCP · Compras.gov.br"); cai para o portal principal se não houver lista. */
function portalList(row: Record<string, unknown>) {
  const codes = Array.isArray(row.source_codes) ? (row.source_codes as unknown[]).map(String) : [];
  const labels = [...new Set(codes.map((code) => PORTAL_LABELS[code] ?? code))];
  if (labels.length) return labels.join(" · ");
  return row.source_portal_name ? String(row.source_portal_name).replace(/^Portal Nacional de Contrata[çc][õo]es P[úu]blicas$/i, "PNCP") : null;
}

export async function getAnalysisTable(module: string, search = "", filters: ProcurementSearchFilters = {}): Promise<AnalysisTable> {
  const supabase = await createClient();
  if (!supabase) return empty("Base de dados temporariamente indisponível.");
  const term = search.trim().slice(0, 120);

  if (module === "licitacoes" || module === "pesquisa") {
    const { data, error } = await supabase.rpc("search_procurements", toSearchRpcParams({ ...filters, text: term, limit: 100 }));
    if (error) return empty("Não foi possível consultar as licitações.");
    return {
      columns: [
        { key: "process", label: "Processo" }, { key: "object", label: "Objeto" }, { key: "organization", label: "Órgão" },
        { key: "uf", label: "UF" }, { key: "modality", label: "Modalidade" }, { key: "dispute", label: "Disputa" }, { key: "meEpp", label: "ME/EPP" }, { key: "status", label: "Situação" },
        { key: "portal", label: "Origem" }, { key: "value", label: "Valor estimado", format: "currency" }, { key: "date", label: "Publicação", format: "date" }, { key: "officialUrl", label: "Portal oficial", format: "external" },
      ],
      rows: (data ?? []).map((row: Record<string, unknown>) => ({ href: `/app/licitacoes/${String(row.id)}`, process: String(row.control_number ?? ""), object: String(row.object_description ?? ""), organization: row.agency_name ? String(row.agency_name) : null, uf: row.state_code ? String(row.state_code) : null, modality: row.modality_name ? String(row.modality_name) : null, dispute: row.dispute_mode ? String(row.dispute_mode) : null, meEpp: row.me_epp_benefit === "exclusiva" ? "Exclusiva" : row.me_epp_benefit === "parcial" ? "Cota/parcial" : row.me_epp_benefit === "sem" ? "Ampla" : null, status: row.status_name ? String(row.status_name) : null, portal: portalList(row), value: Number(row.estimated_value ?? 0), date: row.published_at ? String(row.published_at) : null, officialUrl: externalUrl(row.source_url) })),
      message: data?.length ? null : "Nenhuma licitação sincronizada neste recorte.",
    };
  }

  if (module === "empresas" || module === "concorrentes") {
    let query = supabase.from("company_performance").select("supplier_id, legal_name, state_code, wins, item_count, organization_count, won_value, average_price").order("won_value", { ascending: false }).limit(500);
    if (term) query = query.ilike("legal_name", `%${term}%`);
    const { data, error } = await query;
    if (error) return empty("Não foi possível consultar o desempenho das empresas.");
    const grouped = new Map<string, Record<string, string | number | null>>();
    for (const row of data ?? []) {
      const current = grouped.get(row.supplier_id) ?? { supplierId: row.supplier_id, company: row.legal_name, uf: row.state_code, wins: 0, items: 0, organizations: 0, value: 0, average: 0 };
      current.wins = Number(current.wins) + Number(row.wins ?? 0);
      current.items = Number(current.items) + Number(row.item_count ?? 0);
      current.organizations = Math.max(Number(current.organizations), Number(row.organization_count ?? 0));
      current.value = Number(current.value) + Number(row.won_value ?? 0);
      current.average = Number(row.average_price ?? 0);
      grouped.set(row.supplier_id, current);
    }
    return { columns: [{ key: "company", label: "Empresa" }, { key: "uf", label: "UF" }, { key: "wins", label: "Vitórias", format: "number" }, { key: "items", label: "Itens", format: "number" }, { key: "organizations", label: "Órgãos", format: "number" }, { key: "value", label: "Valor ganho", format: "currency" }, { key: "average", label: "Preço médio", format: "currency" }], rows: [...grouped.values()].sort((a, b) => Number(b.value) - Number(a.value)).slice(0, 100).map((row) => ({ ...row, href: `/app/concorrentes/${String(row.supplierId)}` })), message: grouped.size ? null : "Nenhum vencedor sincronizado neste recorte." };
  }

  if (module === "produtos") {
    let summaryQuery = supabase.from("product_market_summary").select("product_id, grouped_name, state_code, procurement_count, item_count, total_quantity, total_value, average_winner_price").not("grouped_name", "is", null).order("total_value", { ascending: false }).limit(1000);
    if (term) summaryQuery = summaryQuery.ilike("grouped_name", `%${term}%`);
    if (filters.state) summaryQuery = summaryQuery.eq("state_code", filters.state);
    const { data: summaryRows, error: summaryError } = await summaryQuery;
    if (summaryError) return empty("Não foi possível consultar os produtos.");

    const columns: AnalysisTable["columns"] = [
      { key: "product", label: "Produto" }, { key: "code", label: "Classificação" }, { key: "uf", label: "UF" },
      { key: "procurements", label: "Processos", format: "number" }, { key: "items", label: "Itens", format: "number" },
      { key: "quantity", label: "Quantidade", format: "number" }, { key: "value", label: "Valor disponível", format: "currency" },
      { key: "average", label: "Preço médio", format: "currency" },
    ];

    if (summaryRows?.length) {
      type SummaryAggregate = { product: string; code: string | null; uf: string | null; procurements: number; items: number; quantity: number; value: number; average: number; averageWeight: number };
      const grouped = new Map<string, SummaryAggregate>();
      for (const row of summaryRows) {
        const product = String(row.grouped_name);
        const uf = row.state_code ? String(row.state_code) : null;
        const key = `${row.product_id ?? product}:${uf ?? "BR"}`;
        const itemCount = Number(row.item_count ?? 0);
        const current = grouped.get(key) ?? { product, code: null, uf, procurements: 0, items: 0, quantity: 0, value: 0, average: 0, averageWeight: 0 };
        current.procurements = Number(current.procurements) + Number(row.procurement_count ?? 0);
        current.items = Number(current.items) + itemCount;
        current.quantity = Number(current.quantity) + Number(row.total_quantity ?? 0);
        current.value = Number(current.value) + Number(row.total_value ?? 0);
        current.average = Number(current.average) + Number(row.average_winner_price ?? 0) * itemCount;
        current.averageWeight += itemCount;
        grouped.set(key, current);
      }
      const rows = [...grouped.values()].map(({ averageWeight, ...row }) => ({ ...row, average: averageWeight ? Number(row.average) / averageWeight : 0 }));
      return { columns, rows: rows.sort((a, b) => Number(b.value) - Number(a.value)).slice(0, 500), message: null };
    }

    let itemQuery = supabase.from("procurement_items").select("procurement_id,original_description,normalized_description,catalog_item_code,quantity,estimated_unit_value,estimated_total_value,procurements!inner(state_code)").order("estimated_total_value", { ascending: false, nullsFirst: false }).limit(5000);
    if (term) {
      const safeTerm = term.replace(/[%_,().]/g, " ").replace(/\s+/g, " ").trim();
      if (safeTerm) itemQuery = /^\d+$/.test(safeTerm)
        ? itemQuery.or(`original_description.ilike.%${safeTerm}%,normalized_description.ilike.%${safeTerm}%,catalog_item_code.ilike.%${safeTerm}%`)
        : itemQuery.or(`original_description.ilike.%${safeTerm}%,normalized_description.ilike.%${safeTerm}%`);
    }
    if (filters.state) itemQuery = itemQuery.eq("procurements.state_code", filters.state);
    const { data: itemRows, error: itemError } = await itemQuery;
    if (itemError) return empty("Não foi possível consultar as descrições dos itens.");

    type ProductAggregate = { product: string; code: string | null; uf: string | null; procurements: number; items: number; quantity: number; value: number; average: number; procurementIds: Set<string>; unitValueSum: number; unitValueCount: number };
    const groupedItems = new Map<string, ProductAggregate>();
    for (const row of itemRows ?? []) {
      const product = String(row.normalized_description || row.original_description || "").trim();
      if (!product) continue;
      const procurement = Array.isArray(row.procurements) ? row.procurements[0] : row.procurements;
      const uf = procurement?.state_code ? String(procurement.state_code) : null;
      const code = row.catalog_item_code ? String(row.catalog_item_code) : null;
      const key = `${product.toLocaleLowerCase("pt-BR")}:${code ?? "sem-codigo"}:${uf ?? "BR"}`;
      const current = groupedItems.get(key) ?? { product, code, uf, procurements: 0, items: 0, quantity: 0, value: 0, average: 0, procurementIds: new Set<string>(), unitValueSum: 0, unitValueCount: 0 };
      current.procurementIds.add(String(row.procurement_id));
      current.items = Number(current.items) + 1;
      current.quantity = Number(current.quantity) + Number(row.quantity ?? 0);
      current.value = Number(current.value) + Number(row.estimated_total_value ?? 0);
      if (row.estimated_unit_value !== null) {
        current.unitValueSum += Number(row.estimated_unit_value);
        current.unitValueCount += 1;
      }
      groupedItems.set(key, current);
    }
    const rows = [...groupedItems.values()].map(({ procurementIds, unitValueSum, unitValueCount, ...row }) => ({ ...row, procurements: procurementIds.size, average: unitValueCount ? unitValueSum / unitValueCount : 0 }));
    return { columns, rows: rows.sort((a, b) => Number(b.value) - Number(a.value)).slice(0, 500), message: rows.length ? null : "Nenhuma descrição de produto foi encontrada neste recorte." };
  }

  if (module === "precos") {
    let query = supabase.from("price_history").select("product_name, state_code, observed_at, unit, quantity, unit_price").order("observed_at", { ascending: false }).limit(100);
    if (term) query = query.ilike("product_name", `%${term}%`);
    const { data, error } = await query;
    if (error) return empty("Não foi possível consultar o histórico de preços.");
    return { columns: [{ key: "product", label: "Produto" }, { key: "uf", label: "UF" }, { key: "date", label: "Data", format: "date" }, { key: "unit", label: "Unidade" }, { key: "quantity", label: "Quantidade", format: "number" }, { key: "price", label: "Preço unitário", format: "currency" }], rows: (data ?? []).map((row) => ({ product: row.product_name ?? "Produto não agrupado", uf: row.state_code, date: row.observed_at, unit: row.unit, quantity: Number(row.quantity ?? 0), price: Number(row.unit_price) })), message: data?.length ? null : "Nenhum preço válido foi sincronizado." };
  }

  if (module === "orgaos") {
    let query = supabase.from("organization_purchase_summary").select("organization_id, legal_name, state_code, procurement_count, item_count, winner_count, total_value").order("total_value", { ascending: false }).limit(500);
    if (term) query = query.ilike("legal_name", `%${term}%`);
    const { data, error } = await query;
    if (error) return empty("Não foi possível consultar os órgãos.");
    return { columns: [{ key: "organization", label: "Órgão" }, { key: "uf", label: "UF" }, { key: "procurements", label: "Processos", format: "number" }, { key: "items", label: "Itens", format: "number" }, { key: "winners", label: "Vencedores", format: "number" }, { key: "value", label: "Volume", format: "currency" }], rows: (data ?? []).map((row) => ({ organization: row.legal_name, uf: row.state_code, procurements: Number(row.procurement_count), items: Number(row.item_count), winners: Number(row.winner_count), value: Number(row.total_value) })), message: data?.length ? null : "Nenhum órgão com itens sincronizados." };
  }

  if (module === "estados") {
    const { data, error } = await supabase.from("market_summary").select("state_code, procurement_count, item_count, supplier_count, organization_count, total_value").limit(20000);
    if (error) return empty("Não foi possível consultar os estados.");
    const grouped = new Map<string, Record<string, string | number | null>>();
    for (const row of data ?? []) {
      const uf = row.state_code ?? "N/I";
      const current = grouped.get(uf) ?? { uf, procurements: 0, items: 0, suppliers: 0, organizations: 0, value: 0 };
      current.procurements = Number(current.procurements) + Number(row.procurement_count);
      current.items = Number(current.items) + Number(row.item_count);
      current.suppliers = Math.max(Number(current.suppliers), Number(row.supplier_count));
      current.organizations = Math.max(Number(current.organizations), Number(row.organization_count));
      current.value = Number(current.value) + Number(row.total_value);
      grouped.set(uf, current);
    }
    return { columns: [{ key: "uf", label: "UF" }, { key: "procurements", label: "Processos", format: "number" }, { key: "items", label: "Itens", format: "number" }, { key: "suppliers", label: "Vencedores", format: "number" }, { key: "organizations", label: "Órgãos", format: "number" }, { key: "value", label: "Volume", format: "currency" }], rows: [...grouped.values()].sort((a, b) => Number(b.value) - Number(a.value)), message: grouped.size ? null : "Nenhum estado disponível no recorte." };
  }

  return empty("Este módulo está preparado e será conectado na próxima etapa de dados.");
}
