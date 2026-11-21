import { NextResponse } from "next/server";
import { z } from "zod";
import { pncpConnector } from "@/integrations/procurement/pncp/connector";
import { createAdminClient } from "@/lib/supabase/admin";
import { PNCP_MODALITIES } from "@/lib/pncp-modalities";
import { requireUser } from "@/lib/security";

export const dynamic = "force-dynamic";
const querySchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), live: z.literal("1").optional() });
const LIVE_BUDGET_MS = 25_000;
const withDeadline = <T,>(promise: Promise<T>, ms: number): Promise<T | null> =>
  Promise.race([promise, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);

type Row = { code: number; name: string; pncp: number | null; ours: number };

/**
 * Conferência de um dia: total oficial do PNCP x o que temos, por modalidade.
 * Por padrão devolve o que a conferência automática já gravou (instantâneo). Com `live=1` consulta a API oficial na hora,
 * com prazo curto: o PNCP divide o limite de consultas com a coleta, então o que não responder a tempo volta como "indisponível".
 */
export async function GET(request: Request) {
  try {
    await requireUser();
    const { date, live } = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const day = new Date(`${date}T12:00:00Z`);
    if (Number.isNaN(day.getTime()) || day.getTime() > Date.now() + 86_400_000) throw new z.ZodError([]);
    const client = createAdminClient();

    if (!live) {
      const { data } = await client.from("pncp_coverage").select("modality,pncp_total,our_total,checked_at").eq("day", date);
      if ((data ?? []).length > 0) {
        const rows: Row[] = (data ?? []).map((row) => ({ code: Number(row.modality), name: PNCP_MODALITIES[Number(row.modality)] ?? `Modalidade ${row.modality}`, pncp: Number(row.pncp_total), ours: Number(row.our_total) })).sort((a, b) => a.code - b.code);
        const checkedAt = (data ?? []).map((row) => String(row.checked_at)).sort().at(-1) ?? null;
        return NextResponse.json({ date, source: "stored", checkedAt, rows }, { headers: { "Cache-Control": "private, no-store" } });
      }
    }

    const { data: source } = await client.from("sources").select("id").eq("code", "PNCP").single();
    if (!source) throw new Error("fonte");
    // published_at guarda o relógio de Brasília do PNCP como UTC: o dia é o dia UTC
    const start = new Date(`${date}T00:00:00Z`).toISOString();
    const end = new Date(new Date(`${date}T00:00:00Z`).getTime() + 86_400_000).toISOString();
    const codes = Object.keys(PNCP_MODALITIES).map(Number);
    const rows: Row[] = [];
    let next = 0;
    const deadline = Date.now() + LIVE_BUDGET_MS;
    await Promise.all(Array.from({ length: 3 }, async () => {
      while (next < codes.length && Date.now() < deadline) {
        const code = codes[next]; next += 1;
        const [official, local] = await Promise.all([
          withDeadline(pncpConnector.fetchProcurements({ startDate: date, endDate: date, modalityCode: code, page: 1, pageSize: 10 }).then((page) => page.totalRecords ?? 0).catch(() => null), Math.max(1_000, deadline - Date.now())),
          client.from("procurements").select("id", { count: "exact", head: true }).eq("source_id", source.id).eq("modality_code", code).gte("published_at", start).lt("published_at", end),
        ]);
        rows.push({ code, name: PNCP_MODALITIES[code], pncp: official, ours: local.count ?? 0 });
      }
    }));
    rows.sort((a, b) => a.code - b.code);
    return NextResponse.json({ date, source: "live", checkedAt: new Date().toISOString(), partial: next < codes.length, rows: rows.filter((row) => (row.pncp ?? 0) > 0 || row.ours > 0 || row.pncp === null) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : error instanceof Error && error.message === "UNAUTHORIZED" ? 401 : 500;
    return NextResponse.json({ message: status === 400 ? "Data inválida." : status === 401 ? "Sessão necessária." : "Não foi possível conferir agora." }, { status });
  }
}
