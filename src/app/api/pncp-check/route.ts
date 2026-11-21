import { NextResponse } from "next/server";
import { z } from "zod";
import { pncpConnector } from "@/integrations/procurement/pncp/connector";
import { pncpProvider } from "@/providers/pncp-provider";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/security";

export const dynamic = "force-dynamic";
const querySchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
const FALLBACK = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];

/** Conferência ao vivo: para um dia, total oficial do PNCP x o que temos, por modalidade. */
export async function GET(request: Request) {
  try {
    await requireUser();
    const { date } = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const day = new Date(`${date}T12:00:00Z`);
    if (Number.isNaN(day.getTime()) || day.getTime() > Date.now() + 86_400_000) throw new z.ZodError([]);
    const modalities = await pncpProvider.listActiveModalities().catch(() => FALLBACK.map((id) => ({ id, name: `Modalidade ${id}` })));
    const client = createAdminClient();
    const { data: source } = await client.from("sources").select("id").eq("code", "PNCP").single();
    if (!source) throw new Error("fonte");
    // published_at guarda o relógio de Brasília do PNCP como UTC: o dia é o dia UTC
    const start = new Date(`${date}T00:00:00Z`).toISOString();
    const end = new Date(new Date(`${date}T00:00:00Z`).getTime() + 86_400_000).toISOString();
    const rows: Array<{ code: number; name: string; pncp: number | null; ours: number }> = [];
    let next = 0;
    // Poucas chamadas ao mesmo tempo: o PNCP limita por IP e o limitador compartilhado regula o resto
    await Promise.all(Array.from({ length: 3 }, async () => {
      while (next < modalities.length) {
        const modality = modalities[next]; next += 1;
        const [official, local] = await Promise.all([
          pncpConnector.fetchProcurements({ startDate: date, endDate: date, modalityCode: modality.id, page: 1, pageSize: 10 }).then((page) => page.totalRecords ?? 0).catch(() => null),
          client.from("procurements").select("id", { count: "exact", head: true }).eq("source_id", source.id).eq("modality_code", modality.id).gte("published_at", start).lt("published_at", end),
        ]);
        rows.push({ code: modality.id, name: String(modality.name), pncp: official, ours: local.count ?? 0 });
      }
    }));
    rows.sort((a, b) => a.code - b.code);
    return NextResponse.json({ date, rows: rows.filter((row) => (row.pncp ?? 0) > 0 || row.ours > 0) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : error instanceof Error && error.message === "UNAUTHORIZED" ? 401 : 500;
    return NextResponse.json({ message: status === 400 ? "Data inválida." : status === 401 ? "Sessão necessária." : "Não foi possível conferir agora." }, { status });
  }
}
