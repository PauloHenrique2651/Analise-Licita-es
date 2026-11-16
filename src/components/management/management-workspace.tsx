"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Building2, Check, CirclePlus, ListChecks, Target, Trash2 } from "lucide-react";
import { ProcurementPicker, type ProcurementOption as PickerOption } from "@/components/procurement-picker";
import { OpportunityTasks, STAGES, STAGE_LABELS, TasksDrawer } from "@/components/management/opportunity-tasks";
import { createClient } from "@/lib/supabase/client";
import type { ChecklistEvent, ManagedCompany, ManagedOpportunity } from "@/services/management-service";

type Mode = "opportunities" | "funnel" | "checklist";
type CompanyFilter = "all" | "none" | string;

/** O subtítulo com o processo só aparece quando o título ainda não o cita (títulos antigos repetiam tudo). */
const showLabel = (item: ManagedOpportunity) => Boolean(item.procurementLabel) && !item.title.includes((item.procurementLabel ?? "").split(" — ")[0]);
const companyName = (company: ManagedCompany) => company.tradeName || company.legalName;

export function ManagementWorkspace({ mode, initialOpportunities, initialEvents, companies }: { mode: Mode; initialOpportunities: ManagedOpportunity[]; initialEvents: ChecklistEvent[]; companies: ManagedCompany[] }) {
  const [opportunities, setOpportunities] = useState(initialOpportunities);
  const [events, setEvents] = useState(initialEvents);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [picked, setPicked] = useState<PickerOption | null>(null);
  const [filter, setFilter] = useState<CompanyFilter>("all");
  const [tasksOpenId, setTasksOpenId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState(initialOpportunities[0]?.id ?? "");

  const byCompany = useMemo(() => new Map(companies.map((company) => [company.id, company])), [companies]);
  const visible = useMemo(() => opportunities.filter((item) => filter === "all" || (filter === "none" ? !item.companyId : item.companyId === filter)), [opportunities, filter]);
  const progress = useMemo(() => {
    const map = new Map<string, { done: number; total: number }>();
    for (const event of events) {
      const current = map.get(event.opportunityId) ?? { done: 0, total: 0 };
      current.total += 1; if (event.completed) current.done += 1;
      map.set(event.opportunityId, current);
    }
    return map;
  }, [events]);
  const tasksOpen = opportunities.find((item) => item.id === tasksOpenId) ?? null;
  const selected = visible.find((item) => item.id === selectedId) ?? visible[0] ?? null;

  const setTasksFor = (opportunityId: string) => (tasks: ChecklistEvent[]) => setEvents((current) => [...current.filter((event) => event.opportunityId !== opportunityId), ...tasks]);
  const tasksOf = (opportunityId: string) => events.filter((event) => event.opportunityId === opportunityId);

  async function createOpportunity(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true); setError(null); setNotice(null);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const option = picked ? { id: picked.id, label: `${picked.controlNumber} — ${picked.object}` } : undefined;
    const title = String(form.get("title") || option?.label || "Oportunidade sem título").trim();
    const companyId = String(form.get("companyId") || "") || null;
    try {
      const client = createClient();
      const { data: id, error: rpcError } = await client.rpc("create_opportunity", { p_procurement_id: picked?.id ?? null, p_title: title, p_company_id: companyId });
      if (rpcError || !id) throw rpcError ?? new Error();
      const [{ data: row }, { data: taskRows }] = await Promise.all([
        client.from("opportunities").select("id,procurement_id,company_id,title,stage,score,updated_at").eq("id", String(id)).single(),
        client.from("process_events").select("id,opportunity_id,title,description,metadata,created_at").eq("opportunity_id", String(id)).eq("event_type", "checklist_item").order("created_at", { ascending: true }),
      ]);
      if (!row) throw new Error();
      const created: ManagedOpportunity = { id: row.id, procurementId: row.procurement_id, companyId: row.company_id ?? null, title: row.title, stage: row.stage, score: row.score === null ? null : Number(row.score), procurementLabel: option?.label ?? null, updatedAt: row.updated_at };
      const created_tasks: ChecklistEvent[] = (taskRows ?? []).map((task) => {
        const meta = (task.metadata ?? {}) as { completed?: boolean; stage?: string; position?: number; due_at?: string | null; scheduled?: boolean };
        return { id: task.id, opportunityId: task.opportunity_id, title: task.title, description: task.description, completed: Boolean(meta.completed), createdAt: task.created_at, stage: meta.stage ?? "identified", position: Number(meta.position ?? 999), dueAt: meta.due_at ?? null, scheduled: Boolean(meta.scheduled) };
      });
      setOpportunities((current) => [created, ...current]);
      setEvents((current) => [...current, ...created_tasks]);
      setSelectedId(created.id);
      formElement.reset(); setPicked(null);
      setNotice(`Negócio criado com ${created_tasks.length} tarefas padrão. Abra “Tarefas” no cartão para acompanhar.`);
    } catch { setError("Não foi possível criar o negócio. Verifique sua permissão e tente novamente."); } finally { setPending(false); }
  }

  async function removeOpportunity(item: ManagedOpportunity) {
    if (!window.confirm(`Remover "${item.title.slice(0, 80)}" do acompanhamento? As tarefas dele também serão apagadas. A licitação em si continua na base.`)) return;
    setPending(true); setError(null); setNotice(null);
    try {
      const { error: deleteError } = await createClient().from("opportunities").delete().eq("id", item.id);
      if (deleteError) throw deleteError;
      setOpportunities((current) => current.filter((entry) => entry.id !== item.id));
      setEvents((current) => current.filter((event) => event.opportunityId !== item.id));
      setNotice("Negócio removido.");
    } catch { setError("Não foi possível remover. Verifique sua permissão e tente novamente."); } finally { setPending(false); }
  }

  async function updateStage(id: string, stage: string) {
    setPending(true); setError(null);
    try {
      const { error: updateError } = await createClient().from("opportunities").update({ stage, updated_at: new Date().toISOString() }).eq("id", id);
      if (updateError) throw updateError;
      setOpportunities((current) => current.map((item) => item.id === id ? { ...item, stage, updatedAt: new Date().toISOString() } : item));
    } catch { setError("Não foi possível atualizar a fase."); } finally { setPending(false); }
  }

  async function updateCompany(id: string, companyId: string) {
    setPending(true); setError(null);
    try {
      const { error: updateError } = await createClient().from("opportunities").update({ company_id: companyId || null }).eq("id", id);
      if (updateError) throw updateError;
      setOpportunities((current) => current.map((item) => item.id === id ? { ...item, companyId: companyId || null } : item));
    } catch { setError("Não foi possível trocar a empresa do negócio."); } finally { setPending(false); }
  }

  const title = mode === "opportunities" ? "Meus negócios" : mode === "funnel" ? "Funil comercial" : "Checklist";
  const description = mode === "opportunities" ? "Adicione licitações relevantes e acompanhe cada decisão comercial." : mode === "funnel" ? "Organize os negócios por fase. Cada negócio já nasce com as tarefas de todas as fases." : "As tarefas de cada negócio, fase por fase.";

  const card = (item: ManagedOpportunity) => {
    const stats = progress.get(item.id);
    const company = item.companyId ? byCompany.get(item.companyId) : null;
    return <article key={item.id}>
      <div className="funnel-card-head"><strong>{item.title}</strong>
        <button className="icon-button danger" type="button" onClick={() => void removeOpportunity(item)} disabled={pending} aria-label={`Remover ${item.title}`} title="Remover do funil"><Trash2 aria-hidden="true" /></button></div>
      {showLabel(item) ? <p>{item.procurementLabel}</p> : !item.procurementLabel && <p>Sem licitação vinculada</p>}
      {company && <span className="company-badge" title={company.legalName}><Building2 aria-hidden="true" />{companyName(company)}</span>}
      <button type="button" className="tasks-button" onClick={() => setTasksOpenId(item.id)} aria-label={`Abrir tarefas de ${item.title}`}>
        <ListChecks aria-hidden="true" />Tarefas <strong>{stats ? `${stats.done}/${stats.total}` : "0/0"}</strong>
        <span className="tasks-bar" aria-hidden="true"><i style={{ width: stats?.total ? `${(stats.done / stats.total) * 100}%` : "0%" }} /></span>
      </button>
      <select value={item.stage} onChange={(event) => void updateStage(item.id, event.target.value)} disabled={pending} aria-label={`Fase de ${item.title}`}>{STAGES.map((option) => <option key={option} value={option}>{STAGE_LABELS[option]}</option>)}</select>
      {companies.length > 0 && <select className="company-select" value={item.companyId ?? ""} onChange={(event) => void updateCompany(item.id, event.target.value)} disabled={pending} aria-label={`Empresa de ${item.title}`}><option value="">Sem empresa</option>{companies.map((entry) => <option key={entry.id} value={entry.id}>{companyName(entry)}</option>)}</select>}
    </article>;
  };

  const toolbar = <div className="company-toolbar">
    <label className="company-filter"><Building2 aria-hidden="true" /><span className="sr-only">Filtrar por empresa</span>
      <select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filtrar por empresa">
        <option value="all">Todas as empresas</option>
        {companies.map((company) => <option key={company.id} value={company.id}>{companyName(company)}</option>)}
        {companies.length > 0 && <option value="none">Sem empresa</option>}
      </select></label>
    <Link className="text-button" href="/app/minha-empresa">{companies.length === 0 ? "Cadastrar empresa" : "Criar nova empresa"}</Link>
    <span className="company-count">{visible.length} {visible.length === 1 ? "negócio" : "negócios"}</span>
  </div>;

  return <>
    <header className="page-header"><div><p className="eyebrow">GESTÃO</p><h1>{title}</h1><p>{description}</p></div></header>
    {error && <div className="form-error management-notice" role="alert">{error}</div>}
    {notice && <div className="form-success management-notice" role="status"><Check aria-hidden="true" />{notice}</div>}

    {mode !== "checklist" && <section className="panel management-create">
      <div className="panel-head"><div><p className="panel-title">Novo negócio</p><small>Escolha a licitação: o negócio já vem com o checklist padrão de cada fase.</small></div></div>
      <form onSubmit={createOpportunity}><div className="filter-fields">
        <div className="field span-2"><label htmlFor="portal-procurement">Licitação <span className="optional">opcional</span></label><ProcurementPicker value={picked} onChange={setPicked} /></div>
        <div className="field"><label htmlFor="opportunity-title">Título de acompanhamento</label><input id="opportunity-title" name="title" minLength={3} maxLength={300} placeholder="Ex.: Avaliar participação" /></div>
        {companies.length > 0 && <div className="field"><label htmlFor="opportunity-company">Empresa <span className="optional">opcional</span></label><select id="opportunity-company" name="companyId" defaultValue={filter !== "all" && filter !== "none" ? filter : ""}><option value="">Sem empresa</option>{companies.map((company) => <option key={company.id} value={company.id}>{companyName(company)}</option>)}</select></div>}
      </div><div className="drawer-actions"><button className="button primary" disabled={pending}><CirclePlus aria-hidden="true" />Adicionar negócio</button></div></form>
    </section>}

    {mode !== "checklist" && toolbar}

    {mode === "opportunities" && <section className="panel management-list">{visible.length === 0 ? <div className="empty-inline tall"><Target aria-hidden="true" /><span>{opportunities.length === 0 ? "Nenhum negócio criado. Escolha uma licitação acima para começar." : "Nenhum negócio para esta empresa."}</span></div> : visible.map((item) => <div className="management-row" key={item.id}>{card(item)}</div>)}</section>}

    {mode === "funnel" && <section className="funnel-board">{STAGES.map((stage) => <section className="panel funnel-column" key={stage}><header><strong>{STAGE_LABELS[stage]}</strong><small>{visible.filter((item) => item.stage === stage).length}</small></header><div>{visible.filter((item) => item.stage === stage).map(card)}</div></section>)}</section>}

    {mode === "checklist" && <section className="checklist-layout">
      <section className="panel checklist-create">
        <div className="panel-head"><div><p className="panel-title">Negócios</p><small>Escolha para ver as tarefas</small></div></div>
        {opportunities.length === 0 ? <div className="empty-inline"><ListChecks aria-hidden="true" /><span>Crie um negócio antes de acompanhar as tarefas.</span></div> : <>
          <div className="company-toolbar compact">{toolbar.props.children[0]}</div>
          <ul className="checklist-opportunities">{visible.map((item) => { const stats = progress.get(item.id); return <li key={item.id}><button type="button" className={item.id === selected?.id ? "active" : ""} onClick={() => setSelectedId(item.id)}><strong>{item.title}</strong><span>{stats ? `${stats.done}/${stats.total} tarefas` : "sem tarefas"} · {STAGE_LABELS[item.stage]}</span></button></li>; })}</ul></>}
      </section>
      <section className="panel checklist-items">{selected ? <OpportunityTasks opportunity={selected} tasks={tasksOf(selected.id)} onChange={setTasksFor(selected.id)} /> : <div className="empty-inline"><ListChecks aria-hidden="true" /><span>Nenhum negócio selecionado.</span></div>}</section>
    </section>}

    {tasksOpen && <TasksDrawer opportunity={tasksOpen} tasks={tasksOf(tasksOpen.id)} onChange={setTasksFor(tasksOpen.id)} onClose={() => setTasksOpenId(null)} />}
  </>;
}
