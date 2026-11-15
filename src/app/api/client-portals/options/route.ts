import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/security";
import { toSearchRpcParams } from "@/repositories/procurement-repository";

// Processos que podem ser compartilhados no Portal do cliente.
// Sem busca: as oportunidades e favoritos da empresa. Com busca: número do controle/processo ou texto (objeto, órgão).
const querySchema = z.object({ q: z.string().trim().max(120).optional() });

type Option = { id: string; controlNumber: string; object: string; agency: string | null; origin: "oportunidade" | "favorito" | "busca" };
type ProcurementRow = { id: string; control_number: string | null; object_description: string | null; organizations?: { legal_name: string | null } | Array<{ legal_name: string | null }> | null };

const agencyOf = (row: ProcurementRow) => {
  const organization = Array.isArray(row.organizations) ? row.organizations[0] : row.organizations;
  return organization?.legal_name ?? null;
};

export async function GET(request: Request) {
  try {
    const { supabase } = await requireUser();
    const { q } = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const options = new Map<string, Option>();
    const add = (row: ProcurementRow, origin: Option["origin"]) => {
      if (!row?.id || options.has(row.id)) return;
      options.set(row.id, { id: row.id, controlNumber: row.control_number ?? "Sem número", object: row.object_description ?? "Objeto não informado", agency: agencyOf(row), origin });
    };

    if (!q || q.length < 3) {
      const { data: opportunities } = await supabase.from("opportunities").select("procurement_id, updated_at").not("procurement_id", "is", null).order("updated_at", { ascending: false }).limit(50);
      const { data: favorites } = await supabase.from("favorites").select("entity_id").eq("entity_type", "procurement").order("created_at", { ascending: false }).limit(50);
      const ids = [...new Set([...(opportunities ?? []).map((row) => row.procurement_id as string), ...(favorites ?? []).map((row) => row.entity_id as string)])];
      if (ids.length) {
        const { data: rows } = await supabase.from("procurements").select("id, control_number, object_description, organizations(legal_name)").in("id", ids);
        const byId = new Map((rows ?? []).map((row) => [row.id as string, row as ProcurementRow]));
        for (const row of opportunities ?? []) { const match = byId.get(row.procurement_id as string); if (match) add(match, "oportunidade"); }
        for (const row of favorites ?? []) { const match = byId.get(row.entity_id as string); if (match) add(match, "favorito"); }
      }
      return NextResponse.json({ data: [...options.values()], mode: "sugestoes" }, { headers: { "Cache-Control": "private, no-store" } });
    }

    // Número do PNCP/processo: busca direta no controle.
    if (/\d{4,}/.test(q)) {
      const { data: rows } = await supabase.from("procurements").select("id, control_number, object_description, organizations(legal_name)").ilike("control_number", `%${q.replace(/[%_]/g, "")}%`).order("published_at", { ascending: false }).limit(20);
      for (const row of rows ?? []) add(row as ProcurementRow, "busca");
    }
    if (options.size < 20) {
      const { data: rows } = await supabase.rpc("search_procurements", toSearchRpcParams({ text: q, limit: 20, offset: 0 }));
      for (const row of (rows ?? []) as Array<{ id: string; control_number: string; object_description: string; agency_name: string | null }>) {
        if (!options.has(row.id)) options.set(row.id, { id: row.id, controlNumber: row.control_number, object: row.object_description, agency: row.agency_name, origin: "busca" });
      }
    }
    return NextResponse.json({ data: [...options.values()].slice(0, 20), mode: "busca" }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const unauthorized = error instanceof Error && error.message === "UNAUTHORIZED";
    return NextResponse.json({ message: unauthorized ? "Sessão necessária." : "Não foi possível buscar processos." }, { status: unauthorized ? 401 : 500 });
  }
}
