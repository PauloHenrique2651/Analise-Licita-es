import { Activity, AlertTriangle, CheckCircle2, CircleAlert, Database, ShieldCheck } from "lucide-react";
import { SyncButton } from "@/components/admin/sync-button";
import { RealtimeRefresh } from "@/components/admin/realtime-refresh";
import { PNCP_MODALITIES as MODALITIES } from "@/lib/pncp-modalities";
import { procurementPortalRegistry } from "@/integrations/procurement/portals/registry";
import { getAdminOverview, type CoverageModality } from "@/services/admin-service";

export const dynamic = "force-dynamic";

const integer = new Intl.NumberFormat("pt-BR");
const dateTime = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const dayLabel = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "UTC" });

const integrations = [
  { name: "PNCP", description: "Contratações, itens, resultados e documentos", ready: true, note: "Fonte nacional prioritária · atualização contínua" },
  { name: "Compras.gov.br", description: "Contratações, itens, CATMAT, CATSER e preços", ready: true, note: "Fonte nacional redundante · atualização contínua" },
  { name: "Compras RJ", description: "Licitações estaduais, valores, prazos e situação", ready: true, note: "Fonte estadual oficial · verificação diária" },
  { name: "Dados cadastrais", description: "CNPJ, endereço e situação empresarial", ready: true, note: "Consulta segura com redundância automática" },
  { name: "Localidades", description: "Estados, municípios e regiões brasileiras", ready: true, note: "Base territorial oficial · atualização diária" },
  { name: "Inscrição estadual", description: "Inscrição estadual e situação cadastral", ready: false, note: "Disponível após ativação contratual" },
] as const;

const pct = (ours: number, official: number) => official ? Math.min(100, (ours / official) * 100) : 100;
const pctLabel = (value: number) => value >= 100 ? "100%" : `${value.toFixed(1).replace(".", ",")}%`;
export default async function AdminPage() {
  const secondaryPortals = procurementPortalRegistry.filter((portal) => portal.connector === null);
  const { today, yesterday, lastCheckAgo, collectors, coverage, modalities, logs, logTotals, estimates, runs } = await getAdminOverview();

  const dayPct = (day: string) => { const row = coverage.find((item) => item.day === day); return row ? pct(row.ours, row.pncp) : null; };
  const closed = coverage.filter((row) => row.day < today).slice(0, 7);
  const weekPct = closed.length ? pct(closed.reduce((sum, row) => sum + row.ours, 0), closed.reduce((sum, row) => sum + row.pncp, 0)) : null;
  const modalitiesByDay = new Map<string, CoverageModality[]>();
  for (const row of modalities) modalitiesByDay.set(row.day, [...(modalitiesByDay.get(row.day) ?? []), row]);

  const kpis: Array<{ label: string; value: string; note: string; tone?: "ok" | "warn" }> = [
    { label: "Cobertura do PNCP · hoje", value: dayPct(today) === null ? "—" : pctLabel(dayPct(today)!), note: "Total oficial x o nosso, conferido a cada ciclo", tone: dayPct(today) === null ? undefined : dayPct(today)! >= 100 ? "ok" : "warn" },
    { label: "Cobertura do PNCP · ontem", value: dayPct(yesterday) === null ? "—" : pctLabel(dayPct(yesterday)!), note: "Dia fechado: a meta é 100%", tone: dayPct(yesterday) === null ? undefined : dayPct(yesterday)! >= 100 ? "ok" : "warn" },
    { label: "Cobertura · últimos 7 dias", value: weekPct === null ? "—" : pctLabel(weekPct), note: lastCheckAgo ? `Última conferência ${lastCheckAgo}` : "A primeira conferência ainda não terminou", tone: weekPct === null ? undefined : weekPct >= 100 ? "ok" : "warn" },
    { label: "Licitações na base", value: integer.format(estimates.procurements ?? 0), note: "Contagem aproximada" },
    { label: "Erros nas últimas 24 h", value: integer.format(logTotals.error), note: `${integer.format(logTotals.warning)} avisos · quase todos se resolvem sozinhos`, tone: logTotals.error > 0 ? "warn" : "ok" },
  ];
  const stats = [
    ["Licitações", estimates.procurements], ["Itens", estimates.procurement_items], ["Órgãos", estimates.organizations],
    ["Produtos agrupados", estimates.product_groups], ["Concorrentes", estimates.suppliers], ["Resultados", estimates.results], ["Preços", estimates.price_records],
  ] as const;

  return (
    <>
      <RealtimeRefresh />
      <header className="page-header">
        <div>
          <p className="eyebrow">ADMINISTRAÇÃO</p>
          <h1>Fontes e atualização</h1>
          <p>Cobertura dos portais, andamento da coleta e erros explicados em português.</p>
        </div>
        <SyncButton />
      </header>

      <section className="admin-kpis" aria-label="Resumo da coleta">
        {kpis.map((item) => <article className={`panel admin-kpi ${item.tone ?? ""}`} key={item.label}><span>{item.label}</span><strong>{item.value}</strong><small>{item.note}</small></article>)}
      </section>

      <section className="panel admin-collectors" aria-label="Coleta">
        <div className="panel-head"><div><p className="panel-title">Coleta em andamento</p><small>Cada rotina roda sozinha no servidor. &quot;Parada&quot; quer dizer que não concluiu um ciclo no tempo esperado.</small></div></div>
        {collectors.length === 0 ? <div className="empty-inline"><span>Nenhuma rotina registrou execução ainda.</span></div> : <ul className="collector-list">
          {collectors.map((item) => <li key={item.key}>
            <span className={`status-dot ${item.status === "ok" ? "ready" : item.status === "error" ? "failed" : "stale"}`} aria-hidden="true" />
            <div className="collector-main">
              <strong>{item.label}</strong><small>{item.detail}</small>
              {item.progress !== null && <div className="collector-bar" role="progressbar" aria-valuenow={item.progress} aria-valuemin={0} aria-valuemax={100} aria-label={`Progresso de ${item.label}`}><i style={{ width: `${item.progress}%` }} /></div>}
              {item.error && item.status !== "ok" && <small className="collector-error">Último erro: {item.error}</small>}
            </div>
            <div className="collector-side">
              <span className={`status-badge ${item.status === "ok" ? "" : "warning"}`}>{item.status === "ok" ? "Rodando" : item.status === "error" ? "Com falhas" : "Parada"}</span>
              <small>{item.progress !== null ? `${item.progress}% · ` : ""}{item.lastAgo}</small>
            </div>
          </li>)}
        </ul>}
      </section>

      <section className="panel coverage-panel" aria-label="Cobertura do PNCP por dia">
        <div className="panel-head"><div><p className="panel-title">Cobertura do PNCP, dia a dia</p><small>Total oficial do PNCP contra o que temos. Abra um dia para ver por modalidade.</small></div></div>
        {coverage.length === 0 ? <div className="empty-inline"><span>A primeira conferência ainda não terminou.</span></div> : <div className="coverage-days">
          {coverage.map((row) => { const value = pct(row.ours, row.pncp); const list = (modalitiesByDay.get(row.day) ?? []).sort((a, b) => a.modality - b.modality); return <details key={row.day}>
            <summary><span>{dayLabel(row.day)}{row.day === today ? " · hoje" : ""}</span><span className="num">{integer.format(row.ours)} de {integer.format(row.pncp)}</span><span className={`num ${value < 100 ? "neg" : "pos"}`}>{pctLabel(value)}</span></summary>
            <table className="compact-table"><thead><tr><th>Modalidade</th><th className="num">PNCP</th><th className="num">Nosso</th><th className="num">Cobertura</th></tr></thead>
              <tbody>{list.map((item) => <tr key={item.modality}><td>{MODALITIES[item.modality] ?? `Modalidade ${item.modality}`}</td><td className="num">{integer.format(item.pncp)}</td><td className="num">{integer.format(item.ours)}</td><td className={`num ${item.ours < item.pncp ? "neg" : "pos"}`}>{pctLabel(pct(item.ours, item.pncp))}</td></tr>)}</tbody></table>
          </details>; })}
        </div>}
      </section>

      <section className="panel admin-logs" aria-label="Erros e avisos">
        <div className="panel-head"><div><p className="panel-title">Erros e avisos das últimas 24 h</p><small>Mensagens parecidas ficam juntas. A explicação diz se alguém precisa fazer algo.</small></div></div>
        {logs.length === 0 ? <div className="empty-inline tall"><ShieldCheck aria-hidden="true" /><span>Nenhum erro nem aviso nas últimas 24 horas.</span></div> : <ul className="log-list">
          {logs.map((group) => <li key={group.key}>
            <span className={`log-count ${group.level}`}>{integer.format(group.count)}×</span>
            <div className="log-main">
              <strong>{group.title}</strong>
              <p>{group.meaning}</p>
              <small>{group.level === "error" ? "Erro" : "Aviso"} · última vez {group.lastAgo}{group.endpoint ? ` · ${group.endpoint}` : ""}</small>
              <details><summary>Mensagem técnica</summary><code>{group.example}</code></details>
            </div>
            <span className={`status-badge ${group.action ? "warning" : ""}`}>{group.action ?? "Sem ação"}</span>
          </li>)}
        </ul>}
      </section>

      <section className="admin-grid">
        <article className="panel">
          <div className="panel-head"><div><p className="panel-title">Últimas sincronizações</p><small>Execuções mais recentes das rotinas de atualização</small></div></div>
          {runs.length === 0 ? <div className="empty-inline tall"><Activity aria-hidden="true" /><span>Nenhuma execução registrada.</span></div> : <div className="sync-list">{runs.map((run) => {
            const source = Array.isArray(run.sources) ? run.sources[0] : run.sources;
            const status = String(run.status);
            return <article key={String(run.id)}><span className={`status-dot ${status === "succeeded" ? "ready" : status === "running" ? "stale" : ""}`} /><div><strong>{(source as { name?: string } | null)?.name ?? "Fonte externa"}</strong><small>{dateTime.format(new Date(String(run.started_at)))} · {integer.format(Number(run.processed_count ?? 0))} processados · {integer.format(Number(run.error_count ?? 0))} erros</small></div><span className={`status-badge ${status === "succeeded" ? "" : "warning"}`}>{status === "succeeded" ? "Concluída" : status === "running" ? "Em andamento" : status === "partial" ? "Parcial" : "Falhou"}</span></article>;
          })}</div>}
        </article>
        <article className="panel">
          <div className="panel-head"><div><p className="panel-title">Base de dados</p><small>Contagem aproximada por entidade</small></div></div>
          <div className="base-stats">
            {stats.map(([item, count]) => <div key={item}><Database aria-hidden="true" /><span>{item}</span><strong>{integer.format(count ?? 0)}</strong></div>)}
          </div>
        </article>
      </section>

      <section className="integration-grid">
        {integrations.map((integration) => (
          <article className="panel integration-card" key={integration.name}>
            <div className="integration-head">
              <div className="integration-icon">{integration.ready ? <CheckCircle2 aria-hidden="true" /> : <AlertTriangle aria-hidden="true" />}</div>
              <span className={integration.ready ? "status-badge" : "status-badge warning"}>{integration.ready ? "Pronto" : "Atenção"}</span>
            </div>
            <h2>{integration.name}</h2>
            <p>{integration.description}</p>
            <small>{integration.note}</small>
          </article>
        ))}
      </section>

      <section className="panel portal-registry-panel">
        <div className="panel-head"><div><p className="panel-title">Registro de portais complementares</p><small>Novos portais entram na cobertura quando disponibilizam acesso oficial e documentado.</small></div></div>
        <div className="portal-registry-list">
          {secondaryPortals.map((portal) => <article key={portal.code}><div><strong>{portal.name}</strong><small>{portal.url}</small></div><span className={portal.status === "DADOS ABERTOS OFICIAIS" ? "status-badge" : "status-badge warning"}>{portal.status}</span></article>)}
        </div>
      </section>
      <p className="muted admin-note"><CircleAlert aria-hidden="true" /> A cobertura usa o total oficial da API do PNCP por dia de publicação e modalidade. Dias fechados devem chegar a 100% depois da conferência; o dia de hoje acompanha o ritmo de publicação do PNCP.</p>
    </>
  );
}
