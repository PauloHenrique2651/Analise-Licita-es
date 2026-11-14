import Link from "next/link";
import { ArrowRight, Building2, FileSearch, Gavel, PackageSearch, RefreshCw } from "lucide-react";
import { getMarketSummary } from "@/services/market-service";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("pt-BR");

export async function DashboardOverview() {
  const summary = await getMarketSummary();
  const cards = [
    ["Licitações analisadas", number.format(summary.kpis.procurements), Gavel, "/app/licitacoes"],
    ["Itens catalogados", number.format(summary.kpis.items), PackageSearch, "/app/produtos"],
    ["Órgãos compradores", number.format(summary.kpis.organizations), Building2, "/app/orgaos"],
    ["Volume no recorte", money.format(summary.kpis.marketVolume), FileSearch, "/app/mercado"],
  ] as const;
  return <><header className="page-header"><div><p className="eyebrow">VISÃO EXECUTIVA</p><h1>Dashboard</h1><p>Um ponto de partida para acompanhar o mercado e organizar o trabalho comercial.</p></div><Link className="button" href="/app/mercado"><RefreshCw aria-hidden="true" />Atualizar visão</Link></header>
    <section className="dashboard-hero panel"><div><p className="eyebrow">BASE ANALÍTICA</p><h2>{summary.status === "ready" ? `${number.format(summary.records)} registros no recorte atual` : "Base em atualização"}</h2><p>{summary.updatedAt ? `Dados consolidados até ${new Date(summary.updatedAt).toLocaleString("pt-BR")}.` : "Os indicadores aparecerão quando a primeira consolidação estiver pronta."}</p></div><Link href="/app/mercado" className="button primary">Abrir análise de mercado <ArrowRight aria-hidden="true" /></Link></section>
    <section className="dashboard-kpis">{cards.map(([label, value, Icon, href]) => <Link key={label} className="dashboard-kpi panel" href={href}><Icon aria-hidden="true" /><span>{label}</span><strong>{value}</strong><small>Ver detalhes <ArrowRight aria-hidden="true" /></small></Link>)}</section>
    <section className="dashboard-actions"><Link className="panel dashboard-action" href="/app/licitacoes"><Gavel aria-hidden="true" /><div><h2>Explorar licitações</h2><p>Pesquise processos por item, local, órgão, portal e período.</p></div><ArrowRight aria-hidden="true" /></Link><Link className="panel dashboard-action" href="/app/oportunidades"><FileSearch aria-hidden="true" /><div><h2>Organizar oportunidades</h2><p>Transforme processos encontrados em acompanhamento comercial.</p></div><ArrowRight aria-hidden="true" /></Link><Link className="panel dashboard-action" href="/app/clientes"><Building2 aria-hidden="true" /><div><h2>Atualizar clientes</h2><p>Compartilhe uma oportunidade com documento e conversa em tempo real.</p></div><ArrowRight aria-hidden="true" /></Link></section>
  </>;
}
