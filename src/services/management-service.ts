import "server-only";
import { createClient } from "@/lib/supabase/server";

export type ManagedOpportunity = { id: string; procurementId: string | null; title: string; stage: string; score: number | null; procurementLabel: string | null; updatedAt: string };
export type ChecklistEvent = { id: string; opportunityId: string; title: string; description: string | null; completed: boolean; createdAt: string };

export async function getManagementWorkspace() {
  const supabase = await createClient();
  if (!supabase) return { opportunities: [] as ManagedOpportunity[], procurements: [] as Array<{ id: string; label: string }>, events: [] as ChecklistEvent[] };
  const [{ data: opportunityRows }, { data: procurementRows }] = await Promise.all([
    supabase.from("opportunities").select("id,procurement_id,title,stage,score,updated_at,procurements(control_number,object_description)").order("updated_at", { ascending: false }).limit(200),
    supabase.from("procurements").select("id,control_number,object_description").order("published_at", { ascending: false }).limit(100),
  ]);
  const opportunities = (opportunityRows ?? []).map((row) => {
    const procurement = Array.isArray(row.procurements) ? row.procurements[0] : row.procurements;
    return { id: row.id, procurementId: row.procurement_id, title: row.title, stage: row.stage, score: row.score === null ? null : Number(row.score), procurementLabel: procurement ? `${procurement.control_number} — ${procurement.object_description}` : null, updatedAt: row.updated_at };
  });
  const ids = opportunities.map((item) => item.id);
  const { data: eventRows } = ids.length ? await supabase.from("process_events").select("id,opportunity_id,title,description,metadata,created_at").in("opportunity_id", ids).eq("event_type", "checklist_item").order("created_at", { ascending: false }).limit(500) : { data: [] };
  const events = (eventRows ?? []).map((row) => ({ id: row.id, opportunityId: row.opportunity_id, title: row.title, description: row.description, completed: Boolean((row.metadata as { completed?: boolean } | null)?.completed), createdAt: row.created_at }));
  return { opportunities, procurements: (procurementRows ?? []).map((row) => ({ id: row.id, label: `${row.control_number} — ${row.object_description}` })), events };
}
