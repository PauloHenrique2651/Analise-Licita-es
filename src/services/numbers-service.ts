import "server-only";
import { createClient } from "@/lib/supabase/server";

export type NumbersRow = { state: string; cityIbge: string | null; name: string; procurements: number; items: number; value: number };
export type NumbersFilters = { year: number; month?: number; uf?: string };

const pad = (value: number) => String(value).padStart(2, "0");

/** Primeiro e último mês (dia 1) do recorte: o ano inteiro ou um mês. */
export function periodBounds({ year, month }: Pick<NumbersFilters, "year" | "month">) {
  return month ? { from: `${year}-${pad(month)}-01`, to: `${year}-${pad(month)}-01` } : { from: `${year}-01-01`, to: `${year}-12-01` };
}

export async function getNumbers(filters: NumbersFilters) {
  const supabase = await createClient();
  const empty = { states: [] as NumbersRow[], cities: [] as NumbersRow[] };
  if (!supabase) return empty;
  const { from, to } = periodBounds(filters);
  const call = async (group: "state" | "city", state: string | null) => {
    const { data } = await supabase.rpc("numbers_summary", { p_from: from, p_to: to, p_state: state, p_group: group });
    return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      state: String(row.state_code), cityIbge: row.city_ibge_code ? String(row.city_ibge_code) : null, name: String(row.name),
      procurements: Number(row.procurements ?? 0), items: Number(row.items ?? 0), value: Number(row.total_value ?? 0),
    }));
  };
  const [states, cities] = await Promise.all([call("state", null), filters.uf ? call("city", filters.uf) : Promise.resolve([] as NumbersRow[])]);
  return { states, cities };
}

export const currentYear = () => new Date().getFullYear();

export type CoverageDay = { day: string; pncp: number; ours: number; checkedAt: string | null; modalities: number };

/** Cobertura do PNCP por dia, gravada pela conferência automática (total oficial x o que temos). */
export async function getCoverage(days = 14): Promise<CoverageDay[]> {
  const supabase = await createClient();
  if (!supabase) return [];
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const { data } = await supabase.from("pncp_coverage").select("day,pncp_total,our_total,checked_at").gte("day", since).limit(5000);
  const byDay = new Map<string, CoverageDay>();
  for (const row of data ?? []) {
    const key = String(row.day);
    const current = byDay.get(key) ?? { day: key, pncp: 0, ours: 0, checkedAt: null, modalities: 0 };
    current.pncp += Number(row.pncp_total ?? 0); current.ours += Number(row.our_total ?? 0); current.modalities += 1;
    if (!current.checkedAt || String(row.checked_at) > current.checkedAt) current.checkedAt = String(row.checked_at);
    byDay.set(key, current);
  }
  return [...byDay.values()].sort((a, b) => b.day.localeCompare(a.day));
}
