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
    timeline: rows.map((row) => ({ period: row.period_start, value: Number(row.total_value ?? 0) })),
    stateValues,
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
  };
}
