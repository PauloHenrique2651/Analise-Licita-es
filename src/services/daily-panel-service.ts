import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface DailyPanel {
  generatedAt: string;
  dayStart: string;
  dayEnd: string | null;
  publishedToday: number;
  itemsToday: number;
  valueToday: number;
  materialsToday: number;
  servicesToday: number;
  upTo50k: number;
  upTo250k: number;
  above250k: number;
  withoutValue: number;
  meEppToday: number;
  open: number;
  closingIn24h: number;
  byState: Array<{ state: string; count: number }>;
}

export interface DailyPanelResult {
  panel: DailyPanel;
  /** true quando o painel é do dia de hoje; false quando caiu para o último dia com publicações. */
  isToday: boolean;
  /** Data (YYYY-MM-DD, horário de Brasília) a que o painel se refere. */
  refDate: string;
}

const brDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
const asBrDate = (value: Date | string) => brDate.format(new Date(value));

function addDay(date: string) {
  const next = new Date(`${date}T12:00:00-03:00`);
  next.setUTCDate(next.getUTCDate() + 1);
  return asBrDate(next);
}

interface DayRow { id: string; estimated_value: number | null; item_kind: string | null; me_epp_benefit: string | null; state_code: string | null }

async function countItems(supabase: SupabaseClient, ids: string[]) {
  let total = 0;
  for (let index = 0; index < ids.length; index += 80) {
    const { count } = await supabase.from("procurement_items").select("id", { count: "exact", head: true }).in("procurement_id", ids.slice(index, index + 80));
    total += count ?? 0;
  }
  return total;
}

/** Painel do dia. Se hoje ainda não há publicações (fim de semana, feriado), mostra o último dia com dados. */
export async function getDailyPanel(supabase: SupabaseClient, uf?: string): Promise<{ data: DailyPanelResult | null; error: boolean }> {
  const { data, error } = await supabase.rpc("get_daily_opportunity_panel", { p_state: uf ?? null });
  const today = data as DailyPanel | null;
  if (error || !today) return { data: null, error: true };
  const todayDate = asBrDate(today.generatedAt);
  if (today.publishedToday > 0) return { data: { panel: { ...today, dayEnd: null }, isToday: true, refDate: todayDate }, error: false };

  let latestQuery = supabase.from("procurements").select("published_at").not("published_at", "is", null).lt("published_at", today.dayStart).order("published_at", { ascending: false }).limit(1);
  if (uf) latestQuery = latestQuery.eq("state_code", uf);
  const { data: latest } = await latestQuery;
  const latestAt = latest?.[0]?.published_at as string | undefined;
  if (!latestAt) return { data: { panel: { ...today, dayEnd: null }, isToday: true, refDate: todayDate }, error: false };

  const refDate = asBrDate(latestAt);
  const dayStart = new Date(`${refDate}T00:00:00-03:00`).toISOString();
  const dayEnd = new Date(`${addDay(refDate)}T00:00:00-03:00`).toISOString();
  let rowsQuery = supabase.from("procurements").select("id,estimated_value,item_kind,me_epp_benefit,state_code").gte("published_at", dayStart).lt("published_at", dayEnd).limit(1000);
  if (uf) rowsQuery = rowsQuery.eq("state_code", uf);
  const { data: rowsData } = await rowsQuery;
  const rows = (rowsData ?? []) as DayRow[];
  const states = new Map<string, number>();
  for (const row of rows) if (row.state_code) states.set(row.state_code, (states.get(row.state_code) ?? 0) + 1);
  const value = (row: DayRow) => (row.estimated_value === null ? null : Number(row.estimated_value));
  const panel: DailyPanel = {
    ...today,
    dayStart,
    dayEnd,
    publishedToday: rows.length,
    itemsToday: await countItems(supabase, rows.map((row) => row.id)),
    valueToday: rows.reduce((sum, row) => sum + (value(row) ?? 0), 0),
    materialsToday: rows.filter((row) => row.item_kind === "material" || row.item_kind === "misto").length,
    servicesToday: rows.filter((row) => row.item_kind === "servico" || row.item_kind === "misto").length,
    upTo50k: rows.filter((row) => value(row) !== null && value(row)! <= 50000).length,
    upTo250k: rows.filter((row) => value(row) !== null && value(row)! > 50000 && value(row)! <= 250000).length,
    above250k: rows.filter((row) => value(row) !== null && value(row)! > 250000).length,
    withoutValue: rows.filter((row) => value(row) === null).length,
    meEppToday: rows.filter((row) => row.me_epp_benefit === "exclusiva" || row.me_epp_benefit === "parcial").length,
    byState: [...states].map(([state, count]) => ({ state, count })).sort((a, b) => b.count - a.count),
  };
  return { data: { panel, isToday: false, refDate }, error: false };
}

export const FUNNEL_STAGES = [
  { key: "identified", label: "Identificadas" },
  { key: "qualified", label: "Qualificadas" },
  { key: "proposal", label: "Em proposta" },
  { key: "submitted", label: "Enviadas" },
  { key: "won", label: "Ganhas" },
  { key: "lost", label: "Encerradas" },
] as const;

export async function getFunnelCounts(supabase: SupabaseClient) {
  const { data } = await supabase.from("opportunities").select("stage").limit(1000);
  const counts = new Map<string, number>();
  for (const row of (data ?? []) as Array<{ stage: string }>) counts.set(row.stage, (counts.get(row.stage) ?? 0) + 1);
  return FUNNEL_STAGES.map((stage) => ({ ...stage, count: counts.get(stage.key) ?? 0 }));
}
