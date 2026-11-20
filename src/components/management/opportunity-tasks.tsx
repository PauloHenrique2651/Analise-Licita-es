"use client";

import { useRef, useState } from "react";
import { CalendarDays, Check, ListChecks, LoaderCircle, Plus, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { ChecklistEvent, ManagedOpportunity } from "@/services/management-service";

export const STAGES = ["identified", "qualified", "proposal", "submitted", "won", "lost"] as const;
export const STAGE_LABELS: Record<string, string> = {
  identified: "Oportunidade", qualified: "Qualificação", proposal: "Disputa", submitted: "Classificação", won: "Contrato", lost: "Encerrada",
};

const dayFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
const timeFormat = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const dayKey = (value: Date | string | number) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(value));

const metadataOf = (task: Pick<ChecklistEvent, "completed" | "stage" | "position" | "dueAt" | "scheduled">, patch: Partial<{ completed: boolean; due_at: string | null }> = {}) => ({
  completed: patch.completed ?? task.completed, stage: task.stage, position: task.position, scheduled: task.scheduled,
  due_at: patch.due_at !== undefined ? patch.due_at : task.dueAt,
  ...(patch.completed ? { completed_at: new Date().toISOString() } : {}),
});

function Due({ task, now }: { task: ChecklistEvent; now: number }) {
  if (!task.dueAt) return null;
  const due = new Date(task.dueAt);
  const today = dayKey(now);
  const key = dayKey(due);
  const overdue = !task.completed && due.getTime() < now && key !== today;
  const label = key === today ? "Hoje" : key === dayKey(now + 86_400_000) ? "Amanhã" : dayFormat.format(due);
  const time = due.getUTCHours() === 2 && due.getUTCMinutes() === 59 ? "" : ` · ${timeFormat.format(due)}`; // 23:59 de Brasília = fim do dia, sem hora
  return <span className={`task-due ${overdue ? "overdue" : key === today ? "today" : ""}`}><CalendarDays aria-hidden="true" />{overdue ? `Atrasada · ${label}` : `${label}${time}`}</span>;
}

export function OpportunityTasks({ opportunity, tasks, onChange }: { opportunity: ManagedOpportunity; tasks: ChecklistEvent[]; onChange: (tasks: ChecklistEvent[]) => void }) {
  const [now] = useState(() => Date.now());
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addingIn, setAddingIn] = useState<string | null>(null);
  const [editingDue, setEditingDue] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const done = tasks.filter((task) => task.completed).length;
  const percent = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const stagesToShow = STAGES.filter((stage) => stage !== "lost" || tasks.some((task) => task.stage === "lost"));

  async function run(key: string, work: () => Promise<void>, failure: string) {
    setPending(key); setError(null);
    try { await work(); } catch { setError(failure); } finally { setPending(null); }
  }

  // Marcar e remover atualizam a tela na hora; se o servidor recusar, volta ao estado anterior e avisa
  async function optimistic(next: ChecklistEvent[], save: () => PromiseLike<{ error: unknown }>, failure: string) {
    const previous = tasks;
    onChange(next); setError(null);
    try { const { error: saveError } = await save(); if (saveError) throw saveError; } catch { onChange(previous); setError(failure); }
  }

  const toggle = (task: ChecklistEvent) => optimistic(
    tasks.map((item) => item.id === task.id ? { ...item, completed: !item.completed } : item),
    () => createClient().from("process_events").update({ metadata: metadataOf(task, { completed: !task.completed }) }).eq("id", task.id),
    "Não foi possível atualizar a tarefa. A marcação foi desfeita.");

  const remove = (task: ChecklistEvent) => optimistic(
    tasks.filter((item) => item.id !== task.id),
    () => createClient().from("process_events").delete().eq("id", task.id),
    "Não foi possível remover a tarefa. Ela foi restaurada.");

  const setDue = (task: ChecklistEvent, date: string) => run(task.id, async () => {
    // Fim do dia no horário de Brasília (23:59 -03:00)
    const dueAt = date ? new Date(`${date}T23:59:00-03:00`).toISOString() : null;
    const { error: updateError } = await createClient().from("process_events").update({ metadata: metadataOf(task, { due_at: dueAt }) }).eq("id", task.id);
    if (updateError) throw updateError;
    onChange(tasks.map((item) => item.id === task.id ? { ...item, dueAt, scheduled: false } : item));
    setEditingDue(null);
  }, "Não foi possível salvar o prazo.");

  async function add(event: React.FormEvent<HTMLFormElement>, stage: string) {
    event.preventDefault();
    const title = String(new FormData(event.currentTarget).get("title") ?? "").trim();
    const form = event.currentTarget;
    if (title.length < 2) return;
    await run(`add-${stage}`, async () => {
      const position = Math.max(0, ...tasks.filter((task) => task.stage === stage).map((task) => task.position)) + 1;
      const { data, error: insertError } = await createClient().from("process_events")
        .insert({ opportunity_id: opportunity.id, event_type: "checklist_item", title, visibility: "internal", metadata: { completed: false, stage, position, scheduled: false, due_at: null } })
        .select("id,opportunity_id,title,description,metadata,created_at").single();
      if (insertError || !data) throw insertError ?? new Error();
      onChange([...tasks, { id: data.id, opportunityId: data.opportunity_id, title: data.title, description: data.description, completed: false, createdAt: data.created_at, stage, position, dueAt: null, scheduled: false }]);
      form.reset(); setAddingIn(null);
    }, "Não foi possível adicionar a tarefa.");
  }

  const applyDefault = () => run("default", async () => {
    const client = createClient();
    const { error: rpcError } = await client.rpc("apply_default_checklist", { p_opportunity_id: opportunity.id });
    if (rpcError) throw rpcError;
    const { data, error: loadError } = await client.from("process_events").select("id,opportunity_id,title,description,metadata,created_at").eq("opportunity_id", opportunity.id).eq("event_type", "checklist_item").order("created_at", { ascending: true });
    if (loadError) throw loadError;
    onChange((data ?? []).map((row) => {
      const meta = (row.metadata ?? {}) as { completed?: boolean; stage?: string; position?: number; due_at?: string | null; scheduled?: boolean };
      return { id: row.id, opportunityId: row.opportunity_id, title: row.title, description: row.description, completed: Boolean(meta.completed), createdAt: row.created_at, stage: meta.stage ?? "identified", position: Number(meta.position ?? 999), dueAt: meta.due_at ?? null, scheduled: Boolean(meta.scheduled) };
    }));
  }, "Não foi possível criar as tarefas padrão.");

  return <div className="opp-tasks">
    <header className="opp-tasks-head">
      <div className="opp-tasks-ring" style={{ "--pct": `${percent}%` } as React.CSSProperties} role="img" aria-label={`${percent}% concluído`}><span>{percent}%</span></div>
      <div><h2>Tarefas</h2><p>{done} de {tasks.length} concluídas</p></div>
    </header>
    {error && <div className="field-error" role="alert">{error}</div>}

    {tasks.length === 0 && <div className="opp-tasks-empty">
      <ListChecks aria-hidden="true" /><p>Este negócio ainda não tem tarefas.</p>
      <button type="button" className="button primary" onClick={applyDefault} disabled={pending === "default"}>{pending === "default" ? <LoaderCircle className="spin" aria-hidden="true" /> : <Plus aria-hidden="true" />}Criar tarefas padrão de cada fase</button>
    </div>}

    {stagesToShow.map((stage) => {
      const list = tasks.filter((task) => task.stage === stage).sort((a, b) => a.position - b.position);
      if (list.length === 0 && tasks.length === 0) return null;
      const stageDone = list.filter((task) => task.completed).length;
      return <section className="opp-section" key={stage} aria-label={STAGE_LABELS[stage]}>
        <div className="opp-section-head"><strong>{STAGE_LABELS[stage]}</strong><span>{stageDone}/{list.length}</span></div>
        <div className="opp-progress" aria-hidden="true"><i style={{ width: list.length ? `${(stageDone / list.length) * 100}%` : "0%" }} /></div>
        <ul>
          {list.map((task) => <li key={task.id} className={task.completed ? "done" : ""}>
            <button type="button" className="task-check" role="checkbox" aria-checked={task.completed} aria-label={`${task.completed ? "Desmarcar" : "Concluir"}: ${task.title}`} onClick={() => toggle(task)} disabled={pending === task.id}>{task.completed && <Check aria-hidden="true" />}</button>
            <div className="task-body">
              <span className="task-title">{task.title}</span>
              <div className="task-meta">
                {editingDue === task.id
                  ? <input type="date" aria-label={`Prazo de ${task.title}`} defaultValue={task.dueAt ? dayKey(task.dueAt) : ""} autoFocus onBlur={(event) => { if (event.currentTarget.value !== (task.dueAt ? dayKey(task.dueAt) : "")) void setDue(task, event.currentTarget.value); else setEditingDue(null); }} />
                  : <button type="button" className="task-due-button" onClick={() => setEditingDue(task.id)} aria-label={task.dueAt ? `Alterar prazo de ${task.title}` : `Definir prazo de ${task.title}`}>{task.dueAt ? <Due task={task} now={now} /> : <span className="task-due add"><CalendarDays aria-hidden="true" />Prazo</span>}</button>}
                {task.scheduled && <span className="task-model">agendada pelo modelo</span>}
              </div>
            </div>
            <button type="button" className="icon-button danger task-remove" aria-label={`Remover tarefa: ${task.title}`} onClick={() => remove(task)} disabled={pending === task.id}><Trash2 aria-hidden="true" /></button>
          </li>)}
        </ul>
        {addingIn === stage
          ? <form className="task-add-form" onSubmit={(event) => add(event, stage)}><input ref={input} name="title" maxLength={240} placeholder="Nome da tarefa" aria-label={`Nova tarefa em ${STAGE_LABELS[stage]}`} autoFocus required /><button className="button primary" disabled={pending === `add-${stage}`}>Adicionar</button><button type="button" className="icon-button" aria-label="Cancelar" onClick={() => setAddingIn(null)}><X aria-hidden="true" /></button></form>
          : <button type="button" className="task-add" onClick={() => setAddingIn(stage)}><Plus aria-hidden="true" />Adicionar tarefa</button>}
      </section>;
    })}
  </div>;
}

/** Painel lateral com as tarefas de um negócio (abre pelo cartão do funil). */
export function TasksDrawer({ opportunity, tasks, onChange, onClose }: { opportunity: ManagedOpportunity; tasks: ChecklistEvent[]; onChange: (tasks: ChecklistEvent[]) => void; onClose: () => void }) {
  return <div className="drawer-layer" role="presentation">
    <button className="drawer-scrim" aria-label="Fechar tarefas" onClick={onClose} tabIndex={-1} />
    <aside className="tasks-drawer" role="dialog" aria-modal="true" aria-label={`Tarefas de ${opportunity.title}`}>
      <div className="tasks-drawer-top"><p title={opportunity.title}>{opportunity.title}</p><button type="button" className="icon-button" aria-label="Fechar" onClick={onClose}><X aria-hidden="true" /></button></div>
      <OpportunityTasks opportunity={opportunity} tasks={tasks} onChange={onChange} />
    </aside>
  </div>;
}
