import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/security";

const paramsSchema = z.object({ id: z.string().uuid() });
const querySchema = z.object({
  uf: z.string().trim().length(2).transform((value) => value.toUpperCase()).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(8),
  offset: z.coerce.number().int().min(0).max(5000).default(0),
});

/** Licitações em que o produto aparece, com o link do portal oficial. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = paramsSchema.parse(await params);
    const { supabase } = await requireUser();
    const { uf, limit, offset } = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const { data, error } = await supabase.rpc("product_group_procurements", { p_group_id: id, p_state: uf ?? null, p_limit: limit, p_offset: offset });
    if (error) throw error;
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    return NextResponse.json({
      total: Number(rows[0]?.total_count ?? 0),
      data: rows.map((row) => ({
        procurementId: row.procurement_id, controlNumber: row.control_number, object: row.object_description, agency: row.agency_name,
        state: row.state_code, city: row.city_name, publishedAt: row.published_at, status: row.status_name,
        portal: row.source_portal_name, officialUrl: safeUrl(row.source_url), itemDescription: row.item_description,
        quantity: row.quantity === null ? null : Number(row.quantity), unit: row.unit,
        unitValue: row.unit_value === null ? null : Number(row.unit_value),
      })),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : error instanceof Error && error.message === "UNAUTHORIZED" ? 401 : 500;
    return NextResponse.json({ message: status === 401 ? "Sessão necessária." : status === 400 ? "Pedido inválido." : "Não foi possível carregar as licitações." }, { status });
  }
}

function safeUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try { return ["http:", "https:"].includes(new URL(value).protocol) ? value : null; } catch { return null; }
}
