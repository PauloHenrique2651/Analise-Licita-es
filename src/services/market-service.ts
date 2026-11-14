import "server-only";
import { createClient } from "@/lib/supabase/server";

export type MarketFilters = {
  uf?: string;
  query?: string;
  startDate?: string;
  endDate?: string;
};

export async function getMarketSummary(filters: MarketFilters = {}) {
  const supabase = await createClient();
  if (!supabase) return emptyMarketSummary("Base de dados temporariamente indisponível");

  let query = supabase
    .from("market_summary")
    .select("*")
    .order("period_start", { ascending: true });
  if (filters.uf) query = query.eq("state_code", filters.uf);
  if (filters.startDate) query = query.gte("period_start", filters.startDate);
  if (filters.endDate) query = query.lte("period_start", filters.endDate);

  const { data, error } = await query.limit(500);
  if (error) return emptyMarketSummary("A base analítica ainda não foi sincronizada");

  const rows = data ?? [];
  const stateValues = rows.reduce<Record<string, number>>((totals, row) => {
    if (row.state_code) totals[row.state_code] = (totals[row.state_code] ?? 0) + Number(row.record_count ?? 0);
    return totals;
  }, {});
  return {
    status: rows.length ? "ready" : "empty",
    message: rows.length ? null : "Nenhum dado corresponde aos filtros selecionados.",
    updatedAt: rows.at(-1)?.refreshed_at ?? null,
    records: rows.reduce((sum, row) => sum + Number(row.record_count ?? 0), 0),
    kpis: {
      marketVolume: rows.reduce((sum, row) => sum + Number(row.total_value ?? 0), 0),
      procurements: rows.reduce((sum, row) => sum + Number(row.procurement_count ?? 0), 0),
      items: rows.reduce((sum, row) => sum + Number(row.item_count ?? 0), 0),
      suppliers: Math.max(0, ...rows.map((row) => Number(row.supplier_count ?? 0))),
      organizations: Math.max(0, ...rows.map((row) => Number(row.organization_count ?? 0))),
      averageTicket: rows.length
        ? rows.reduce((sum, row) => sum + Number(row.average_ticket ?? 0), 0) / rows.length
        : 0,
      averageWinnerPrice: rows.length
        ? rows.reduce((sum, row) => sum + Number(row.average_winner_price ?? 0), 0) / rows.length
        : 0,
    },
    timeline: timelineByPeriod(rows),
    stateValues,
    rankings: await getRankings(supabase, filters.uf),
  };
}

export type RankingItem = { label: string; value: number; detail: string | null };
export type Rankings = { suppliers: RankingItem[]; products: RankingItem[]; organizations: RankingItem[] };

function timelineByPeriod(rows: Array<{ period_start: string | null; total_value: number | string | null }>) {
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (!row.period_start) continue;
    const key = String(row.period_start).slice(0, 7);
    totals.set(key, (totals.get(key) ?? 0) + Number(row.total_value ?? 0));
  }
  return [...totals.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([period, value]) => ({ period, value }));
}

async function getRankings(supabase: Awaited<ReturnType<typeof createClient>>, uf?: string): Promise<Rankings> {
  let suppliers = supabase.from("company_performance").select("legal_name,state_code,wins,won_value").order("won_value", { ascending: false }).limit(500);
  let products = supabase.from("product_market_summary").select("grouped_name,state_code,procurement_count,total_value").not("grouped_name", "is", null).order("total_value", { ascending: false }).limit(500);
  let organizations = supabase.from("organization_purchase_summary").select("legal_name,state_code,procurement_count,total_value").order("total_value", { ascending: false }).limit(500);
  if (uf) { suppliers = suppliers.eq("state_code", uf); products = products.eq("state_code", uf); organizations = organizations.eq("state_code", uf); }
  const [{ data: supplierRows }, { data: productRows }, { data: organizationRows }] = await Promise.all([suppliers, products, organizations]);

  const top = (rows: Array<Record<string, unknown>> | null, name: string, value: string, detail: (row: Record<string, unknown>) => string | null): RankingItem[] => {
    const grouped = new Map<string, { value: number; detail: number }>();
    for (const row of rows ?? []) {
      const label = String(row[name] ?? "").trim();
      if (!label) continue;
      const current = grouped.get(label) ?? { value: 0, detail: 0 };
      current.value += Number(row[value] ?? 0);
      current.detail += Number(detail(row) ?? 0);
      grouped.set(label, current);
    }
    return [...grouped.entries()].sort((a, b) => b[1].value - a[1].value).slice(0, 5).map(([label, item]) => ({ label, value: item.value, detail: item.detail ? String(item.detail) : null }));
  };
  return {
    suppliers: top(supplierRows as Array<Record<string, unknown>> | null, "legal_name", "won_value", (row) => String(row.wins ?? 0)),
    products: top(productRows as Array<Record<string, unknown>> | null, "grouped_name", "total_value", (row) => String(row.procurement_count ?? 0)),
    organizations: top(organizationRows as Array<Record<string, unknown>> | null, "legal_name", "total_value", (row) => String(row.procurement_count ?? 0)),
  };
}

function emptyMarketSummary(message: string) {
  return {
    status: "empty",
    message,
    updatedAt: null,
    records: 0,
    kpis: {
      marketVolume: 0,
      procurements: 0,
      items: 0,
      suppliers: 0,
      organizations: 0,
      averageTicket: 0,
      averageWinnerPrice: 0,
    },
    timeline: [] as Array<{ period: string; value: number }>,
    stateValues: {} as Record<string, number>,
    rankings: { suppliers: [], products: [], organizations: [] } as Rankings,
  };
}
