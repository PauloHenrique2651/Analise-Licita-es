import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/security";

const paramsSchema = z.object({ id: z.string().uuid() });
const querySchema = z.object({
  offered: z.coerce.number().positive().max(1_000_000_000),
  uf: z.string().trim().length(2).transform((value) => value.toUpperCase()).optional(),
  days: z.coerce.number().int().refine((value) => [90, 180, 365, 730].includes(value)).default(365),
});

const num = (value: unknown) => (value === null || value === undefined ? null : Number(value));

/**
 * Em que posição o valor oferecido ficaria entre os vencedores recentes do produto, quem são os concorrentes mais fortes
 * e, quando há pelo menos 3 outras empresas simulando, como o valor se compara aos demais clientes do Nexo (agregado anônimo).
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = paramsSchema.parse(await params);
    const { supabase } = await requireUser();
    const { offered, uf, days } = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const [position, clients, winners, suppliers] = await Promise.all([
      supabase.rpc("product_price_position", { p_group_id: id, p_offered: offered, p_state: uf ?? null, p_days: days }),
      supabase.rpc("product_clients_position", { p_group_id: id, p_offered: offered, p_days: days }),
      supabase.rpc("product_group_winning_prices", { p_group_id: id, p_state: uf ?? null, p_days: days, p_limit: 10 }),
      supabase.rpc("product_group_suppliers", { p_group_id: id, p_state: uf ?? null, p_days: days, p_limit: 6 }),
    ]);
    if (position.error) throw position.error;
    const p = (position.data as Array<Record<string, unknown>> | null)?.[0];
    const c = (clients.data as Array<Record<string, unknown>> | null)?.[0];
    return NextResponse.json({
      data: {
        offered, uf: uf ?? null, days,
        position: p ? {
          sampleSize: Number(p.sample_size ?? 0), lowerCount: Number(p.lower_count ?? 0), projectedRank: Number(p.projected_rank ?? 1), percentile: num(p.percentile),
          min: num(p.min_value), p25: num(p.p25_value), median: num(p.median_value), p75: num(p.p75_value), max: num(p.max_value),
          bestSupplierId: p.best_supplier_id ?? null, bestSupplierName: p.best_supplier_name ?? null,
          differenceToBestPct: num(p.difference_to_best_pct), differenceToMedianPct: num(p.difference_to_median_pct), unit: p.unit ?? null,
        } : null,
        clients: c ? { companies: Number(c.companies), simulations: Number(c.simulations), min: num(c.min_value), median: num(c.median_value), max: num(c.max_value), lowerCount: Number(c.lower_count), percentile: num(c.percentile) } : null,
        winners: ((winners.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
          supplierId: row.supplier_id ?? null, supplier: row.supplier_name ?? "Fornecedor não informado", unitValue: Number(row.unit_value), wonAt: row.published_at ?? row.won_at ?? null,
          state: row.state_code ?? null, city: row.city_name ?? null, procurementId: row.procurement_id, controlNumber: row.control_number, officialUrl: safeUrl(row.source_url),
        })),
        suppliers: ((suppliers.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
          supplierId: row.supplier_id, name: row.supplier_name, wins: Number(row.wins), median: num(row.median_unit_value), min: num(row.min_unit_value), last: num(row.last_unit_value), lastWinAt: row.last_win_at ?? null,
        })),
      },
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : error instanceof Error && error.message === "UNAUTHORIZED" ? 401 : 500;
    return NextResponse.json({ message: status === 400 ? "Informe um valor maior que zero." : status === 401 ? "Sessão necessária." : "Não foi possível calcular a posição." }, { status });
  }
}

function safeUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try { return ["http:", "https:"].includes(new URL(value).protocol) ? value : null; } catch { return null; }
}
