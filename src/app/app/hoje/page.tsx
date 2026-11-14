import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, Hourglass, Layers } from "lucide-react";
import { DetailLink } from "@/components/procurement/detail-link";
import { createClient } from "@/lib/supabase/server";
import { getAgendaItems } from "@/services/agenda-service";
import { getDailyPanel, getFunnelCounts } from "@/services/daily-panel-service";

export const metadata: Metadata = { title: "Hoje" };
export const dynamic = "force-dynamic";

const UFS = ["AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO"];

interface ProcurementRow {
  id: string;
  control_number: string | null;
  object_description: string | null;
  agency_name: string | null;
  city_name: string | null;
  state_code: string | null;
  modality_name: string | null;
  dispute_mode: string | null;
  me_epp_benefit: string | null;
  estimated_value: number | null;
  published_at: string | null;
  proposal_end_at: string | null;
}

const integer = new Intl.NumberFormat("pt-BR");
const compactCurrency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 });
const longDate = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Sao_Paulo" });
const timeFormat = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const shortDateTime = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

const COLUMNS = "id,control_number,object_description,agency_name,city_name,state_code,modality_name,dispute_mode,me_epp_benefit,estimated_value,published_at,proposal_end_at";

function hoursLeft(value: string | null) {
  if (!value) return null;
  const hours = (new Date(value).getTime() - Date.now()) / 3_600_000;
  if (hours <= 0) return "encerrada";
  if (hours < 1) return "menos de 1 h";
  return `${Math.floor(hours)} h`;
}

function MeEppBadge({ value }: { value: string | null }) {
  if (value === "exclusiva") return <span className="badge badge-accent">Exclusiva ME/EPP</span>;
  if (value === "parcial") return <span className="badge">Cota ME/EPP</span>;
  return null;
}

function ProcurementList({ rows, empty, mode }: { rows: ProcurementRow[]; empty: string; mode: "closing" | "published" }) {
  if (!rows.length) return <div className="empty-inline">{empty}</div>;
  return (
    <ol className="today-list">
      {rows.map((row) => (
        <li key={row.id}>
          <DetailLink procurementId={row.id}>
            <div className="today-list-main">
              <strong>{row.object_description ?? "Objeto não informado"}</strong>
              <span>{[row.agency_name, row.city_name && row.state_code ? `${row.city_name}/${row.state_code}` : row.state_code].filter(Boolean).join(" · ")}</span>
              <div className="today-badges">
                {row.modality_name && <span className="badge">{row.modality_name}</span>}
                {row.dispute_mode && row.dispute_mode !== "Não se aplica" && <span className="badge">{/^dispensa/i.test(row.dispute_mode) ? row.dispute_mode : `Disputa ${row.dispute_mode.toLowerCase()}`}</span>}
                <MeEppBadge value={row.me_epp_benefit} />
              </div>
            </div>
            <div className="today-list-side">
              {mode === "closing"
                ? <><strong>{hoursLeft(row.proposal_end_at)}</strong><small>{row.proposal_end_at ? `até ${timeFormat.format(new Date(row.proposal_end_at))}` : ""}</small></>
                : <><strong>{Number(row.estimated_value) > 0 ? compactCurrency.format(Number(row.estimated_value)) : "Sem valor"}</strong><small>{row.proposal_end_at ? `propostas até ${shortDateTime.format(new Date(row.proposal_end_at))}` : ""}</small></>}
            </div>
          </DetailLink>
        </li>
      ))}
    </ol>
  );
}

const monthTitle = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "America/Sao_Paulo" });
const dayLabel = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });

function WeekAgenda({ items }: { items: Awaited<ReturnType<typeof getAgendaItems>> }) {
  const now = new Date();
  const week = items.filter((item) => { const time = new Date(item.date).getTime(); return time >= now.getTime() && time <= now.getTime() + 7 * 86_400_000; }).slice(0, 4);
  const year = now.getFullYear(); const month = now.getMonth();
  const first = new Date(year, month, 1).getDay(); const days = new Date(year, month + 1, 0).getDate();
  const eventDays = new Set(items.filter((item) => { const d = new Date(item.date); return d.getFullYear() === year && d.getMonth() === month; }).map((item) => new Date(item.date).getDate()));
  const cells: Array<number | null> = [...Array(first).fill(null), ...Array.from({ length: days }, (_, index) => index + 1)];
  return (
    <section className="panel today-agenda">
      <div className="panel-head"><div><p className="panel-title">Agenda da semana</p><small>{week.length ? `${week.length} compromisso(s) nos próximos dias.` : "Nenhum evento nos próximos dias."}</small></div><Link className="text-button" href="/app/agenda">Abrir agenda</Link></div>
      {week.length > 0 && <ul className="agenda-mini">{week.map((item) => <li key={item.id}><strong>{item.title}</strong><small>{item.kind} · {dayLabel.format(new Date(item.date))}</small></li>)}</ul>}
      <div className="mini-cal">
        <p className="mini-cal-title">{monthTitle.format(now).replace(/^./, (letter) => letter.toUpperCase())}</p>
        <div className="mini-cal-grid" role="grid" aria-label="Calendário do mês">
          {["D", "S", "T", "Q", "Q", "S", "S"].map((name, index) => <span key={index} className="mini-cal-head">{name}</span>)}
          {cells.map((day, index) => day === null ? <span key={index} /> : <span key={index} className={`mini-cal-day${day === now.getDate() ? " today" : ""}${eventDays.has(day) ? " has-event" : ""}`}>{day}</span>)}
        </div>
      </div>
    </section>
  );
}

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ uf?: string }> }) {
  const { uf: rawUf } = await searchParams;
  const uf = rawUf && UFS.includes(rawUf.toUpperCase()) ? rawUf.toUpperCase() : undefined;
  const supabase = await createClient();

  const { data: panelResult, error } = await getDailyPanel(supabase, uf);
  const panel = panelResult?.panel ?? null;
  const isToday = panelResult?.isToday ?? true;
  const refDate = panelResult?.refDate ?? new Date().toISOString().slice(0, 10);
  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 3_600_000);
  const dayStart = panel?.dayStart ?? new Date(now.toDateString()).toISOString();
  const dayWord = isToday ? "hoje" : `em ${refDate.split("-").reverse().slice(0, 2).join("/")}`;

  let closingQuery = supabase.from("procurements").select(COLUMNS).gt("proposal_end_at", now.toISOString()).lte("proposal_end_at", in24h.toISOString()).order("proposal_end_at", { ascending: true }).limit(15);
  let publishedQuery = supabase.from("procurements").select(COLUMNS).gte("published_at", dayStart).order("published_at", { ascending: false }).limit(15);
  if (panel?.dayEnd) publishedQuery = publishedQuery.lt("published_at", panel.dayEnd);
  if (uf) {
    closingQuery = closingQuery.eq("state_code", uf);
    publishedQuery = publishedQuery.eq("state_code", uf);
  }
  const [{ data: closing }, { data: published }, agenda, funnel] = await Promise.all([closingQuery, publishedQuery, getAgendaItems(), getFunnelCounts(supabase)]);

  const today = refDate;
  const ufParam = uf ? `&uf=${uf}` : "";
  const buckets = panel ? [
    { label: "Até R$ 50 mil", value: panel.upTo50k, href: `/app/licitacoes?from=${today}&maxValue=50000${ufParam}` },
    { label: "R$ 50 mil a R$ 250 mil", value: panel.upTo250k, href: `/app/licitacoes?from=${today}&minValue=50000&maxValue=250000${ufParam}` },
    { label: "Acima de R$ 250 mil", value: panel.above250k, href: `/app/licitacoes?from=${today}&minValue=250000${ufParam}` },
    { label: "Sem valor informado", value: panel.withoutValue, href: null },
  ] : [];
  const bucketMax = Math.max(1, ...buckets.map((bucket) => bucket.value));

  return (
    <>
      <header className="page-header today-header">
        <div>
          <h1>Hoje em licitações</h1>
          <p>{longDate.format(now).replace(/^./, (letter) => letter.toUpperCase())}{panel ? ` · atualizado às ${timeFormat.format(new Date(panel.generatedAt))}` : ""}</p>
        </div>
        <form method="get" className="today-scope">
          <label htmlFor="today-uf">Estado</label>
          <select id="today-uf" name="uf" defaultValue={uf ?? ""}>
            <option value="">Brasil</option>
            {UFS.map((state) => <option key={state} value={state}>{state}</option>)}
          </select>
          <button className="button" type="submit">Aplicar</button>
        </form>
      </header>

      {error || !panel ? (
        <div className="form-error" role="alert">Não foi possível montar o painel agora. Verifique se a sincronização de licitações está ativa.</div>
      ) : (
        <>
          {!isToday && <div className="data-notice"><CalendarClock aria-hidden="true" /><span><strong>Ainda não há licitações publicadas hoje.</strong>Mostrando o último dia com publicações: {refDate.split("-").reverse().join("/")}.</span></div>}
          <div className="today-top">
            <section className="panel today-hero">
              <div className="panel-head"><div><p className="panel-title">Licitações publicadas {dayWord}</p><small>Panorama do dia{uf ? ` · ${uf}` : " · Brasil"}</small></div><span className="count-pill">{integer.format(panel.publishedToday)}</span></div>
              <div className="today-hero-body">
                <Link className="hero-metric" href={`/app/licitacoes?from=${today}${ufParam}`}>
                  <Layers aria-hidden="true" />
                  <div><small>Itens publicados {dayWord}</small><strong>{integer.format(panel.itemsToday)}</strong><span>Soma dos itens das {integer.format(panel.publishedToday)} licitações do dia.</span></div>
                </Link>
                <div className="hero-tiles">
                  <div className="hero-tile"><small>Serviços</small><strong>{integer.format(panel.servicesToday)}</strong></div>
                  <div className="hero-tile"><small>Materiais</small><strong>{integer.format(panel.materialsToday)}</strong></div>
                  <div className="hero-tile"><small>Até R$ 50 mil</small><strong>{integer.format(panel.upTo50k)}</strong></div>
                  <div className="hero-tile"><small>Até R$ 250 mil</small><strong>{integer.format(panel.upTo250k)}</strong></div>
                  <div className="hero-tile"><small>Acima de R$ 250 mil</small><strong>{integer.format(panel.above250k)}</strong></div>
                </div>
                <Link className="text-button" href={`/app/licitacoes?from=${today}${ufParam}`}>Ver todas as oportunidades do dia</Link>
              </div>
            </section>
            <WeekAgenda items={agenda} />
          </div>

          <section className="kpi-grid today-kpis" aria-label="Números do dia">
            <Link className="kpi-card" href={`/app/licitacoes?from=${today}${ufParam}`}><div className="kpi-label">Publicadas {dayWord}</div><strong>{integer.format(panel.publishedToday)}</strong><small>{integer.format(panel.itemsToday)} itens</small></Link>
            <Link className="kpi-card" href={`/app/licitacoes?open=1${ufParam}`}><div className="kpi-label">Com propostas abertas</div><strong>{integer.format(panel.open)}</strong><small>ainda recebendo propostas</small></Link>
            <article className="kpi-card"><div className="kpi-label">Encerram em 24 h</div><strong>{integer.format(panel.closingIn24h)}</strong><small>prazo de proposta</small></article>
            <Link className="kpi-card" href={`/app/licitacoes?from=${today}&meEpp=com_beneficio${ufParam}`}><div className="kpi-label">Com benefício ME/EPP</div><strong>{integer.format(panel.meEppToday)}</strong><small>publicadas {dayWord}</small></Link>
            <article className="kpi-card"><div className="kpi-label">Material · Serviço</div><strong>{integer.format(panel.materialsToday)} · {integer.format(panel.servicesToday)}</strong><small>licitações mistas contam nos dois</small></article>
            <article className="kpi-card"><div className="kpi-label">Valor estimado hoje</div><strong>{compactCurrency.format(Number(panel.valueToday))}</strong><small>soma das publicadas {dayWord}</small></article>
          </section>

          <div className="today-grid">
            <section className="panel">
              <div className="panel-head"><div><p className="panel-title">Encerram nas próximas 24 horas</p><small>Últimas chances de enviar proposta.</small></div><Hourglass aria-hidden="true" className="panel-icon" /></div>
              <ProcurementList rows={(closing ?? []) as ProcurementRow[]} mode="closing" empty="Nenhuma licitação encerra nas próximas 24 horas neste recorte." />
            </section>
            <section className="panel">
              <div className="panel-head"><div><p className="panel-title">Publicadas {dayWord}</p><small>As mais recentes primeiro.</small></div><CalendarClock aria-hidden="true" className="panel-icon" /></div>
              <ProcurementList rows={(published ?? []) as ProcurementRow[]} mode="published" empty={`Nenhuma licitação publicada ${dayWord} até agora neste recorte.`} />
              {panel.publishedToday > 15 && <div className="today-more"><Link className="text-button" href={`/app/licitacoes?from=${today}${ufParam}`}>Ver as {integer.format(panel.publishedToday)} publicadas {dayWord}</Link></div>}
            </section>
          </div>

          <div className="today-grid">
            <section className="panel">
              <div className="panel-head"><div><p className="panel-title">Faixa de valor das publicadas {dayWord}</p><small>Clique para ver a lista de cada faixa.</small></div></div>
              <ul className="bucket-list">
                {buckets.map((bucket) => (
                  <li key={bucket.label}>
                    {bucket.href ? <Link href={bucket.href}>{bucket.label}</Link> : <span>{bucket.label}</span>}
                    <span className="bucket-bar" aria-hidden="true"><i style={{ width: `${(bucket.value / bucketMax) * 100}%` }} /></span>
                    <strong>{integer.format(bucket.value)}</strong>
                  </li>
                ))}
              </ul>
            </section>
            <section className="panel">
              <div className="panel-head"><div><p className="panel-title">Publicadas {dayWord} por estado</p><small>{uf ? "Recorte já filtrado por estado." : "Clique para focar em um estado."}</small></div></div>
              {panel.byState.length === 0 ? <div className="empty-inline">Sem publicações neste dia.</div> : (
                <ul className="state-chips">
                  {panel.byState.map((item) => (
                    <li key={item.state}><Link href={`/app/hoje?uf=${item.state}`} className={item.state === uf ? "active" : undefined}>{item.state}<small>{integer.format(item.count)}</small></Link></li>
                  ))}
                </ul>
              )}
            </section>
          </div>
          <section className="panel">
            <div className="panel-head"><div><p className="panel-title">Funil de licitações</p><small>Suas oportunidades por etapa.</small></div><Link className="text-button" href="/app/funil">Ver funil</Link></div>
            <ul className="funnel-row">
              {funnel.map((stage) => <li key={stage.key}><strong>{integer.format(stage.count)}</strong><span>{stage.label}</span></li>)}
            </ul>
          </section>
        </>
      )}
    </>
  );
}
