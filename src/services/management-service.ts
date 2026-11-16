import "server-only";
import { createClient } from "@/lib/supabase/server";

export type ManagedCompany = { id: string; cnpj: string; legalName: string; tradeName: string | null; state: string | null };
export type ManagedOpportunity = {
  id: string; procurementId: string | null; title: string; stage: string; score: number | null; procurementLabel: string | null; updatedAt: string;
  companyId: string | null;
};
/** Tarefa do checklist de um negócio. `metadata` guarda o restante (posição, prazo) e é reenviado inteiro ao atualizar. */
export type ChecklistEvent = {
  id: string; opportunityId: string; title: string; description: string | null; completed: boolean; createdAt: string;
  stage: string; position: number; dueAt: string | null; scheduled: boolean;
};

export async function getManagementWorkspace() {
  const supabase = await createClient();
  if (!supabase) return { opportunities: [] as ManagedOpportunity[], events: [] as ChecklistEvent[], companies: [] as ManagedCompany[] };
  const [{ data: opportunityRows }, { data: companyRows }] = await Promise.all([
    supabase.from("opportunities").select("id,procurement_id,company_id,title,stage,score,updated_at,procurements(control_number,object_description)").order("updated_at", { ascending: false }).limit(200),
    supabase.from("companies").select("id,cnpj,legal_name,trade_name,state_code").order("legal_name").limit(50),
  ]);
  const opportunities: ManagedOpportunity[] = (opportunityRows ?? []).map((row) => {
    const procurement = Array.isArray(row.procurements) ? row.procurements[0] : row.procurements;
    return {
      id: row.id, procurementId: row.procurement_id, companyId: row.company_id ?? null, title: row.title, stage: row.stage,
      score: row.score === null ? null : Number(row.score),
      procurementLabel: procurement ? `${procurement.control_number} — ${procurement.object_description}` : null, updatedAt: row.updated_at,
    };
  });
  const companies: ManagedCompany[] = (companyRows ?? []).map((row) => ({ id: row.id, cnpj: String(row.cnpj), legalName: row.legal_name, tradeName: row.trade_name ?? null, state: row.state_code ?? null }));
  const ids = opportunities.map((item) => item.id);
  const { data: eventRows } = ids.length
    ? await supabase.from("process_events").select("id,opportunity_id,title,description,metadata,created_at").in("opportunity_id", ids).eq("event_type", "checklist_item").order("created_at", { ascending: true }).limit(3000)
    : { data: [] };
  const events: ChecklistEvent[] = (eventRows ?? []).map((row) => {
    const meta = (row.metadata ?? {}) as { completed?: boolean; stage?: string; position?: number; due_at?: string | null; scheduled?: boolean };
    return {
      id: row.id, opportunityId: row.opportunity_id, title: row.title, description: row.description, completed: Boolean(meta.completed), createdAt: row.created_at,
      stage: meta.stage ?? "identified", position: Number(meta.position ?? 999), dueAt: meta.due_at ?? null, scheduled: Boolean(meta.scheduled),
    };
  });
  return { opportunities, events, companies };
}
