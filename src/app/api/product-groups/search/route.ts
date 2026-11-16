import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/security";

const querySchema = z.object({ q: z.string().trim().min(2).max(100) });

/** Busca de produto agrupado (para escolher o produto na Disputa). */
export async function GET(request: Request) {
  try {
    const { supabase } = await requireUser();
    const { q } = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const { data, error } = await supabase.rpc("search_product_groups", { p_text: q, p_limit: 8 });
    if (error) throw error;
    const rows = (data ?? []) as Array<{ id: string; name: string; niche: string; procurement_count: number; unit: string | null }>;
    return NextResponse.json({ data: rows.map((row) => ({ id: row.id, name: row.name, niche: row.niche, procurements: row.procurement_count, unit: row.unit })) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : error instanceof Error && error.message === "UNAUTHORIZED" ? 401 : 500;
    return NextResponse.json({ message: status === 400 ? "Digite ao menos 2 letras." : status === 401 ? "Sessão necessária." : "Não foi possível buscar produtos." }, { status });
  }
}
