import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/security";

const querySchema = z.object({ uf: z.string().trim().length(2).transform((value) => value.toUpperCase()) });

/** Municípios (IBGE) de um estado, para o filtro por município. Dados públicos e estáveis: cache de 1 dia no navegador. */
export async function GET(request: Request) {
  try {
    const { supabase } = await requireUser();
    const { uf } = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const { data, error } = await supabase.from("cities").select("ibge_code, name").eq("state_code", uf).order("name").limit(1000);
    if (error) throw error;
    return NextResponse.json({ data: (data ?? []).map((row) => ({ ibge: row.ibge_code as string, name: row.name as string })) }, { headers: { "Cache-Control": "private, max-age=86400" } });
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : error instanceof Error && error.message === "UNAUTHORIZED" ? 401 : 500;
    return NextResponse.json({ message: status === 400 ? "UF inválida." : status === 401 ? "Sessão necessária." : "Não foi possível carregar os municípios." }, { status });
  }
}
