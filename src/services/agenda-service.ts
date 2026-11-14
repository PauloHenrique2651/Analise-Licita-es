import "server-only";
import { createClient } from "@/lib/supabase/server";

export type AgendaItem = {
  id: string;
  title: string;
  controlNumber: string | null;
  stage: string;
  date: string;
  kind: "Prazo de propostas" | "Sessão pública";
};

export async function getAgendaItems() {
  const supabase = await createClient();
  if (!supabase) return [] as AgendaItem[];
  const { data } = await supabase
    .from("opportunities")
    .select("id,title,stage,procurements(control_number,object_description,proposal_end_at,opening_at)")
    .order("updated_at", { ascending: false })
    .limit(300);

  return (data ?? []).flatMap((row) => {
    const procurement = Array.isArray(row.procurements) ? row.procurements[0] : row.procurements;
    if (!procurement) return [];
    const entries: AgendaItem[] = [];
    if (procurement.proposal_end_at) entries.push({ id: `${row.id}-proposal`, title: row.title || procurement.object_description || "Oportunidade", controlNumber: procurement.control_number, stage: row.stage, date: procurement.proposal_end_at, kind: "Prazo de propostas" });
    if (procurement.opening_at) entries.push({ id: `${row.id}-opening`, title: row.title || procurement.object_description || "Oportunidade", controlNumber: procurement.control_number, stage: row.stage, date: procurement.opening_at, kind: "Sessão pública" });
    return entries;
  }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).slice(0, 100);
}
