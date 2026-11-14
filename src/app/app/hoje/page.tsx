import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, Hourglass } from "lucide-react";
import { DetailLink } from "@/components/procurement/detail-link";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Hoje" };
export const dynamic = "force-dynamic";

const UFS = ["AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO"];

interface DailyPanel {
  generatedAt: string;
  dayStart: string;
  publishedToday: number;
  itemsToday: number;
  valueToday: number;
  materialsToday: number;
  servicesToday: number;
  upTo50k: number;
  upTo250k: number;
  above250k: number;
  withoutValue: number;
  meEppToday: number;
  open: number;
  closingIn24h: number;
  byState: Array<{ state: string; count: number }>;
}

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

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ uf?: string }> }) {
  const { uf: rawUf } = await searchParams;
  const uf = rawUf && UFS.includes(rawUf.toUpperCase()) ? rawUf.toUpperCase() : undefined;
  const supabase = await createClient();

  const { data: panelData, error } = await supabase.rpc("get_daily_opportunity_panel", { p_state: uf ?? null });
  const panel = panelData as DailyPanel | null;
  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 3_600_000);
  const dayStart = panel?.dayStart ?? new Date(now.toDateString()).toISOString();

  let closingQuery = supabase.from("procurements").select(COLUMNS).gt("proposal_end_at", now.toISOString()).lte("proposal_end_at", in24h.toISOString()).order("proposal_end_at", { ascending: true }).limit(15);
  let publishedQuery = supabase.from("procurements").select(COLUMNS).gte("published_at", dayStart).order("published_at", { ascending: false }).limit(15);
  if (uf) {
    closingQuery = closingQuery.eq("state_code", uf);
    publishedQuery = publishedQuery.eq("state_code", uf);
  }
  const [{ data: closing }, { data: published }] = await Promise.all([closingQuery, publishedQuery]);

  const today = new Date().toISOString().slice(0, 10);
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
          <section className="kpi-grid today-kpis" aria-label="Números do dia">
            <Link className="kpi-card" href={`/app/licitacoes?from=${today}${ufParam}`}><div className="kpi-label">Publicadas hoje</div><strong>{integer.format(panel.publishedToday)}</strong><small>{integer.format(panel.itemsToday)} itens</small></Link>
            <Link className="kpi-card" href={`/app/licitacoes?open=1${ufParam}`}><div className="kpi-label">Com propostas abertas</div><strong>{integer.format(panel.open)}</strong><small>ainda recebendo propostas</small></Link>
            <article className="kpi-card"><div className="kpi-label">Encerram em 24 h</div><strong>{integer.format(panel.closingIn24h)}</strong><small>prazo de proposta</small></article>
            <Link className="kpi-card" href={`/app/licitacoes?from=${today}&meEpp=com_beneficio${ufParam}`}><div className="kpi-label">Com benefício ME/EPP</div><strong>{integer.format(panel.meEppToday)}</strong><small>publicadas hoje</small></Link>
            <article className="kpi-card"><div className="kpi-label">Material · Serviço</div><strong>{integer.format(panel.materialsToday)} · {integer.format(panel.servicesToday)}</strong><small>licitações mistas contam nos dois</small></article>
            <article className="kpi-card"><div className="kpi-label">Valor estimado hoje</div><strong>{compactCurrency.format(Number(panel.valueToday))}</strong><small>soma das publicadas hoje</small></article>
          </section>

          <div className="today-grid">
            <section className="panel">
              <div className="panel-head"><div><p className="panel-title">Encerram nas próximas 24 horas</p><small>Últimas chances de enviar proposta.</small></div><Hourglass aria-hidden="true" className="panel-icon" /></div>
              <ProcurementList rows={(closing ?? []) as ProcurementRow[]} mode="closing" empty="Nenhuma licitação encerra nas próximas 24 horas neste recorte." />
            </section>
            <section className="panel">
              <div className="panel-head"><div><p className="panel-title">Publicadas hoje</p><small>As mais recentes primeiro.</small></div><CalendarClock aria-hidden="true" className="panel-icon" /></div>
              <ProcurementList rows={(published ?? []) as ProcurementRow[]} mode="published" empty="Nenhuma licitação publicada hoje até agora neste recorte." />
              {panel.publishedToday > 15 && <div className="today-more"><Link className="text-button" href={`/app/licitacoes?from=${today}${ufParam}`}>Ver as {integer.format(panel.publishedToday)} publicadas hoje</Link></div>}
            </section>
          </div>

          <div className="today-grid">
            <section className="panel">
              <div className="panel-head"><div><p className="panel-title">Faixa de valor das publicadas hoje</p><small>Clique para ver a lista de cada faixa.</small></div></div>
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
              <div className="panel-head"><div><p className="panel-title">Publicadas hoje por estado</p><small>{uf ? "Recorte já filtrado por estado." : "Clique para focar em um estado."}</small></div></div>
              {panel.byState.length === 0 ? <div className="empty-inline">Sem publicações hoje.</div> : (
                <ul className="state-chips">
                  {panel.byState.map((item) => (
                    <li key={item.state}><Link href={`/app/hoje?uf=${item.state}`} className={item.state === uf ? "active" : undefined}>{item.state}<small>{integer.format(item.count)}</small></Link></li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </>
  );
}
