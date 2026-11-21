import { NextResponse } from "next/server";
import { z } from "zod";
import { renderRegionalReport } from "@/lib/report/pdf-regional";
import { normalizeData } from "@/lib/report/regional-report";
import { requireUser } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const querySchema = z.object({
  cities: z.string().regex(/^\d{7}(,\d{7}){0,149}$/),
  from: dateSchema,
  to: dateSchema,
  kind: z.enum(["material", "servico"]).optional(),
  name: z.string().trim().min(2).max(80).optional(),
});

// Relatório é pesado (vários segundos de banco): no máximo 4 por minuto por usuário
const recent = new Map<string, number[]>();
function allowed(userId: string) {
  const now = Date.now();
  const hits = (recent.get(userId) ?? []).filter((time) => now - time < 60_000);
  if (hits.length >= 4) { recent.set(userId, hits); return false; }
  recent.set(userId, [...hits, now]);
  return true;
}

const slug = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "regiao";

/** Gera o relatório gerencial em PDF dos municípios e do período escolhidos. */
export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    if (!allowed(user.id)) return NextResponse.json({ message: "Muitos relatórios em sequência. Aguarde um minuto." }, { status: 429 });
    const query = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const from = new Date(`${query.from}T00:00:00Z`);
    const to = new Date(`${query.to}T00:00:00Z`);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to || to.getTime() - from.getTime() > 800 * 86_400_000) throw new z.ZodError([]);
    const ibges = [...new Set(query.cities.split(","))];

    const [{ data: report, error }, { data: cityRows }] = await Promise.all([
      supabase.rpc("regional_report", { p_cities: ibges, p_from: query.from, p_to: query.to, p_item_kind: query.kind ?? null }),
      supabase.from("cities").select("ibge_code,name").in("ibge_code", ibges).limit(200),
    ]);
    if (error || !report) throw error ?? new Error("relatório");
    const cityNames = (cityRows ?? []).map((row) => String(row.name)).sort((a, b) => a.localeCompare(b, "pt-BR"));
    const regionName = query.name ?? (cityNames.length === 1 ? cityNames[0] : `${cityNames.length} municípios`);
    const pdf = await renderRegionalReport(normalizeData(report as Record<string, unknown>), { regionName, cities: ibges, from: query.from, to: query.to, itemKind: query.kind }, cityNames);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="relatorio-${slug(regionName)}-${query.to}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : error instanceof Error && error.message === "UNAUTHORIZED" ? 401 : 500;
    return NextResponse.json({ message: status === 400 ? "Escolha os municípios e um período válido (até 2 anos)." : status === 401 ? "Sessão necessária." : "Não foi possível gerar o relatório agora." }, { status });
  }
}
