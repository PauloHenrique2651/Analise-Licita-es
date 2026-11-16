import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/security";
import { getMarketSummary } from "@/services/market-service";

const querySchema = z.object({ uf: z.string().trim().length(2).transform((value) => value.toUpperCase()).optional() });

/** Resumo do mercado (indicadores, evolução e rankings) para o Brasil ou para um estado: usado ao clicar no mapa. */
export async function GET(request: Request) {
  try {
    await requireUser();
    const { uf } = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const summary = await getMarketSummary({ uf });
    return NextResponse.json({ data: summary }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : error instanceof Error && error.message === "UNAUTHORIZED" ? 401 : 500;
    return NextResponse.json({ message: status === 400 ? "UF inválida." : status === 401 ? "Sessão necessária." : "Não foi possível carregar o mercado." }, { status });
  }
}
