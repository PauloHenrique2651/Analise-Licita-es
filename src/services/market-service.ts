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

  // Rankings não dependem do resumo: buscam juntos em vez de em fila
  const rankingsPromise = getRankings(supabase, filters.uf);
  const { data, error } = await query.limit(20000);
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
    rankings: await rankingsPromise,
  };
}

export type RankingItem = { label: string; value: number; detail: string | null; /** Página do sistema com o detalhe deste item. */ href?: string };
export type Rankings = { suppliers: RankingItem[]; products: RankingItem[]; organizations: RankingItem[] };

/** Primeiro mês (AAAA-MM) da janela de 12 meses que termina no mês atual. */
export function windowStartMonth(now = new Date(), months = 12) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));
  return start.toISOString().slice(0, 7);
}

function timelineByPeriod(rows: Array<{ period_start: string | null; total_value: number | string | null }>) {
  const totals = new Map<string, number>();
  const since = windowStartMonth();
  for (const row of rows) {
    if (!row.period_start) continue;
    const key = String(row.period_start).slice(0, 7);
    if (key < since) continue;
    totals.set(key, (totals.get(key) ?? 0) + Number(row.total_value ?? 0));
  }
  return [...totals.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([period, value]) => ({ period, value }));
}

async function getRankings(supabase: Awaited<ReturnType<typeof createClient>>, uf?: string): Promise<Rankings> {
  let suppliers = supabase.from("company_performance").select("supplier_id,legal_name,state_code,wins,won_value").order("won_value", { ascending: false }).limit(500);
  let products = supabase.from("product_market_summary").select("grouped_name,state_code,procurement_count,total_value").not("grouped_name", "is", null).order("total_value", { ascending: false }).limit(500);
  let organizations = supabase.from("organization_purchase_summary").select("legal_name,state_code,procurement_count,total_value").order("total_value", { ascending: false }).limit(500);
  if (uf) { suppliers = suppliers.eq("state_code", uf); products = products.eq("state_code", uf); organizations = organizations.eq("state_code", uf); }
  const [{ data: supplierRows }, { data: productRows }, { data: organizationRows }] = await Promise.all([suppliers, products, organizations]);

  const top = (rows: Array<Record<string, unknown>> | null, name: string, value: string, detail: (row: Record<string, unknown>) => string | null, href: (row: Record<string, unknown>, label: string) => string | undefined): RankingItem[] => {
    const grouped = new Map<string, { value: number; detail: number; href?: string }>();
    for (const row of rows ?? []) {
      const label = String(row[name] ?? "").trim();
      if (!label) continue;
      const current = grouped.get(label) ?? { value: 0, detail: 0, href: href(row, label) };
      current.value += Number(row[value] ?? 0);
      current.detail += Number(detail(row) ?? 0);
      grouped.set(label, current);
    }
    return [...grouped.entries()].sort((a, b) => b[1].value - a[1].value).slice(0, 5).map(([label, item]) => ({ label, value: item.value, detail: item.detail ? String(item.detail) : null, href: item.href }));
  };
  return {
    suppliers: top(supplierRows as Array<Record<string, unknown>> | null, "legal_name", "won_value", (row) => String(row.wins ?? 0), (row) => row.supplier_id ? `/app/concorrentes/${String(row.supplier_id)}` : undefined),
    products: top(productRows as Array<Record<string, unknown>> | null, "grouped_name", "total_value", (row) => String(row.procurement_count ?? 0), (_row, label) => `/app/produtos?q=${encodeURIComponent(label)}${uf ? `&uf=${uf}` : ""}`),
    organizations: top(organizationRows as Array<Record<string, unknown>> | null, "legal_name", "total_value", (row) => String(row.procurement_count ?? 0), (_row, label) => `/app/licitacoes?agency=${encodeURIComponent(label)}${uf ? `&uf=${uf}` : ""}`),
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

export type CityMetric = "value" | "procurements" | "items";
export type CityHeat = { ibge: string; name: string; value: number; procurements: number; items: number };

/** Mapa de calor dos municípios de um estado (últimos 12 meses). */
export async function getCityHeat(uf: string): Promise<CityHeat[]> {
  const supabase = await createClient();
  if (!supabase) return [];
  const since = `${windowStartMonth()}-01`;
  const [{ data: rows }, { data: cities }] = await Promise.all([
    supabase.from("market_city_month").select("city_ibge_code,procurement_count,item_count,total_value").eq("state_code", uf).gte("period_start", since).limit(20000),
    supabase.from("cities").select("ibge_code,name").eq("state_code", uf).order("name").limit(1000),
  ]);
  const totals = new Map<string, CityHeat>();
  for (const city of cities ?? []) totals.set(String(city.ibge_code), { ibge: String(city.ibge_code), name: city.name, value: 0, procurements: 0, items: 0 });
  for (const row of rows ?? []) {
    const current = totals.get(String(row.city_ibge_code));
    if (!current) continue;
    current.value += Number(row.total_value ?? 0);
    current.procurements += Number(row.procurement_count ?? 0);
    current.items += Number(row.item_count ?? 0);
  }
  return [...totals.values()];
}

/** Números de um ou mais municípios: indicadores, evolução mensal e rankings (órgãos, vencedores, produtos). */
export async function getCitySummary(ibges: string[]) {
  const supabase = await createClient();
  if (!supabase) return emptyMarketSummary("Base de dados temporariamente indisponível");
  const since = `${windowStartMonth()}-01`;
  const [{ data: rows }, { data: rankingRows }] = await Promise.all([
    supabase.from("market_city_month").select("city_ibge_code,period_start,procurement_count,item_count,organization_count,total_value,refreshed_at").in("city_ibge_code", ibges).gte("period_start", since).order("period_start", { ascending: true }).limit(2000),
    supabase.from("market_city_ranking").select("city_ibge_code,kind,label,ref_id,value,count").in("city_ibge_code", ibges).limit(1000),
  ]);
  const list = rows ?? [];
  const procurements = list.reduce((sum, row) => sum + Number(row.procurement_count ?? 0), 0);
  const marketVolume = list.reduce((sum, row) => sum + Number(row.total_value ?? 0), 0);
  // Órgãos: o maior mês de cada município, somados (um órgão pertence a um só município)
  const orgsByCity = new Map<string, number>();
  for (const row of list) orgsByCity.set(String(row.city_ibge_code), Math.max(orgsByCity.get(String(row.city_ibge_code)) ?? 0, Number(row.organization_count ?? 0)));
  // Rankings: cada município guarda os 5 maiores; somamos os mesmos nomes entre municípios e ficamos com os 5 maiores
  const ranking = (kind: string, href: (item: { label: string; refId: string | null }) => string | undefined): RankingItem[] => {
    const merged = new Map<string, { label: string; refId: string | null; value: number; count: number }>();
    for (const row of (rankingRows ?? []) as Array<{ kind: string; label: string; ref_id: string | null; value: number | string; count: number | string }>) {
      if (row.kind !== kind) continue;
      const key = row.ref_id ?? row.label;
      const current = merged.get(key) ?? { label: row.label, refId: row.ref_id, value: 0, count: 0 };
      current.value += Number(row.value); current.count += Number(row.count);
      merged.set(key, current);
    }
    return [...merged.values()].sort((a, b) => b.value - a.value).slice(0, 5).map((item) => ({ label: item.label, value: item.value, detail: String(item.count), href: href(item) }));
  };
  const cities = ibges.join(",");
  return {
    status: list.length ? "ready" : "empty",
    message: list.length ? null : "Nenhuma licitação neste período para o que foi escolhido.",
    updatedAt: list.at(-1)?.refreshed_at ?? null,
    records: procurements,
    kpis: {
      marketVolume,
      procurements,
      items: list.reduce((sum, row) => sum + Number(row.item_count ?? 0), 0),
      organizations: [...orgsByCity.values()].reduce((sum, value) => sum + value, 0),
      averageTicket: procurements ? marketVolume / procurements : 0,
    } as Record<string, number>,
    timeline: timelineByPeriod(list.map((row) => ({ period_start: row.period_start, total_value: row.total_value }))),
    stateValues: {} as Record<string, number>,
    rankings: {
      suppliers: ranking("supplier", (item) => item.refId ? `/app/concorrentes/${item.refId}` : undefined),
      // O produto abre a página dele já filtrada pelos municípios escolhidos: lista as licitações em que aparece
      products: ranking("product", (item) => item.refId ? `/app/produtos/${item.refId}?municipio=${cities}` : `/app/produtos?q=${encodeURIComponent(item.label)}`),
      organizations: ranking("organization", (item) => `/app/licitacoes?agency=${encodeURIComponent(item.label)}${ibges.length === 1 ? `&municipio=${ibges[0]}` : ""}`),
    } as Rankings,
  };
}
