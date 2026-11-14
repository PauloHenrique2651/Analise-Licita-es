import "server-only";
import { createClient } from "@/lib/supabase/server";

export async function getCompetitorProfile(id: string) {
  const supabase = await createClient();
  if (!supabase) return null;
  const [{ data: supplier }, { data: periods }, { data: prices }, { data: results }] = await Promise.all([
    supabase.from("suppliers").select("id,cnpj_cpf,legal_name,trade_name,state_code").eq("id", id).maybeSingle(),
    supabase.from("company_performance").select("period_start,state_code,wins,item_count,organization_count,won_value,average_price").eq("supplier_id", id).order("period_start", { ascending: true }).limit(120),
    supabase.from("price_history").select("product_name,state_code,observed_at,unit,quantity,unit_price").eq("supplier_id", id).order("observed_at", { ascending: false }).limit(20),
    supabase.from("results").select("winner,total_value,unit_value,procurement_items!inner(original_description,procurements!inner(control_number,organizations(legal_name,state_code)))").eq("supplier_id", id).eq("winner", true).order("imported_at", { ascending: false }).limit(20),
  ]);
  if (!supplier) return null;
  const aggregate = (periods ?? []).reduce((total, row) => ({ wins: total.wins + Number(row.wins ?? 0), items: total.items + Number(row.item_count ?? 0), organizations: Math.max(total.organizations, Number(row.organization_count ?? 0)), value: total.value + Number(row.won_value ?? 0), priceSum: total.priceSum + Number(row.average_price ?? 0), priceCount: total.priceCount + (Number(row.average_price ?? 0) > 0 ? 1 : 0) }), { wins: 0, items: 0, organizations: 0, value: 0, priceSum: 0, priceCount: 0 });
  const stateTotals = new Map<string, number>();
  for (const row of periods ?? []) stateTotals.set(row.state_code ?? "N/I", (stateTotals.get(row.state_code ?? "N/I") ?? 0) + Number(row.won_value ?? 0));
  const states = [...stateTotals.entries()].map(([state, value]) => ({ state, value })).sort((a, b) => b.value - a.value);
  return { supplier, periods: periods ?? [], prices: prices ?? [], results: results ?? [], states, kpis: { ...aggregate, averagePrice: aggregate.priceCount ? aggregate.priceSum / aggregate.priceCount : 0 } };
}
