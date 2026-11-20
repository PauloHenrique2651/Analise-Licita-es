import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/security";
import { getCityHeat, getCitySummary, getMarketSummary } from "@/services/market-service";

const querySchema = z.object({
  uf: z.string().trim().length(2).transform((value) => value.toUpperCase()).optional(),
  city: z.string().trim().regex(/^\d{7}$/).optional(),
  heat: z.literal("1").optional(),
});

/** Resumo do mercado (indicadores, evolução e rankings) para o Brasil, um estado ou um município; `heat=1` devolve o mapa de calor dos municípios do estado. */
export async function GET(request: Request) {
  try {
    await requireUser();
    const { uf, city, heat } = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    if (heat) {
      if (!uf) throw new z.ZodError([]);
      return NextResponse.json({ data: await getCityHeat(uf) }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const summary = city ? await getCitySummary(city) : await getMarketSummary({ uf });
    return NextResponse.json({ data: summary }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : error instanceof Error && error.message === "UNAUTHORIZED" ? 401 : 500;
    return NextResponse.json({ message: status === 400 ? "Consulta inválida." : status === 401 ? "Sessão necessária." : "Não foi possível carregar o mercado." }, { status });
  }
}
