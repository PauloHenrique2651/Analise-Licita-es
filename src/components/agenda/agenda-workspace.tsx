import { CalendarClock, CalendarDays, ChevronRight, Clock3 } from "lucide-react";
import Link from "next/link";
import type { AgendaItem } from "@/services/agenda-service";

const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "full", timeStyle: "short" });

export function AgendaWorkspace({ items, asOf }: { items: AgendaItem[]; asOf: string }) {
  const now = new Date(asOf).getTime();
  const upcoming = items.filter((item) => new Date(item.date).getTime() >= now);
  return <><header className="page-header"><div><p className="eyebrow">GESTÃO</p><h1>Agenda de licitações</h1><p>Prazos de proposta e sessões das oportunidades que seu time acompanha.</p></div><Link className="button" href="/app/oportunidades"><CalendarDays aria-hidden="true" />Gerir oportunidades</Link></header>
    <section className="agenda-summary"><article className="panel"><CalendarClock aria-hidden="true" /><span>Próximos compromissos</span><strong>{upcoming.length}</strong><small>Derivados das datas oficiais dos processos acompanhados.</small></article><article className="panel"><Clock3 aria-hidden="true" /><span>Vencidos ou realizados</span><strong>{items.length - upcoming.length}</strong><small>Permaneçam visíveis para rastreabilidade.</small></article></section>
    <section className="panel agenda-list"><div className="panel-head"><div><p className="panel-title">Próximas datas</p><small>Atualizada quando a oportunidade ou sua origem é atualizada.</small></div></div>{items.length === 0 ? <div className="empty-inline tall"><CalendarDays aria-hidden="true" /><span>Adicione uma licitação às suas oportunidades para centralizar automaticamente seus prazos.</span></div> : <ol>{items.map((item) => <li key={item.id} className={new Date(item.date).getTime() < now ? "past" : ""}><time><strong>{new Date(item.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</strong><span>{new Date(item.date).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span></time><div><span className="status-badge">{item.kind}</span><h2>{item.title}</h2><p>{item.controlNumber ?? "Processo sem número disponível"} · {item.stage}</p><small>{dateTime.format(new Date(item.date))}</small></div><Link href="/app/oportunidades" aria-label={`Abrir ${item.title}`}><ChevronRight aria-hidden="true" /></Link></li>)}</ol>}</section>
  </>;
}
