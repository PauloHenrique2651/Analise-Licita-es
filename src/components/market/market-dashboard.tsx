"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronDown, Database, Filter, Info, Radio, RefreshCw, Search, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BrazilMap } from "./brazil-map";
import { MarketChart } from "./market-chart";
import type { RankingItem } from "@/services/market-service";

type Summary = {
  status: string;
  message: string | null;
  updatedAt: string | null;
  records: number;
  kpis: Record<string, number>;
  timeline: Array<{ period: string; value: number }>;
  stateValues: Record<string, number>;
  rankings: { suppliers: RankingItem[]; products: RankingItem[]; organizations: RankingItem[] };
};

const kpiDefinitions = [
  ["marketVolume", "Volume de mercado", "Soma dos valores homologados válidos nos resultados filtrados.", "currency"],
  ["procurements", "Licitações", "Quantidade distinta de processos encontrados.", "number"],
  ["items", "Itens", "Quantidade de itens de contratação no recorte.", "number"],
  ["suppliers", "Empresas vencedoras", "Fornecedores distintos com resultado vencedor disponível.", "number"],
  ["organizations", "Órgãos compradores", "Órgãos distintos presentes no recorte.", "number"],
  ["averageTicket", "Ticket médio", "Valor homologado total dividido pela quantidade de processos com valor.", "currency"],
  ["averageWinnerPrice", "Preço médio vencedor", "Média dos valores unitários vencedores válidos.", "currency"],
] as const;

function format(value: number, type: string) {
  if (type === "currency") return Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: value >= 1_000_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);
  return Intl.NumberFormat("pt-BR").format(value);
}

export function MarketDashboard({ initialSummary }: { initialSummary: Summary }) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedUf, setSelectedUf] = useState<string>();
  const [chips, setChips] = useState(["Últimos 12 meses"]);
  const [liveConnected, setLiveConnected] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel("market-live-sync")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "imports" }, () => router.refresh())
      .subscribe((status) => setLiveConnected(status === "SUBSCRIBED"));
    return () => { void supabase.removeChannel(channel); };
  }, [router]);

  function applyFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const next = [String(data.get("period") || "Últimos 12 meses")];
    const product = String(data.get("product") || "").trim();
    const category = String(data.get("category") || "").trim();
    if (product) next.unshift(product);
    if (category) next.unshift(category);
    setChips(next);
    setFiltersOpen(false);
  }

  return (
    <>
      <header className="page-header market-header">
        <div><p className="eyebrow">INTELIGÊNCIA NACIONAL / MERCADO</p><h1>Análise de mercado</h1><p>Compras públicas consolidadas para transformar dados brutos em decisões comerciais verificáveis.</p></div>
        <div className="market-actions"><span className={liveConnected ? "status-badge" : "status-badge warning"}><Radio aria-hidden="true" />{liveConnected ? "Atualização ao vivo" : "Conectando"}</span><button className="button secondary" disabled={refreshing} onClick={() => startRefresh(() => router.refresh())}><RefreshCw className={refreshing ? "spin" : ""} aria-hidden="true" />{refreshing ? "Atualizando…" : "Atualizar"}</button></div>
      </header>

      <section className="data-strip evidence-strip" aria-label="Situação dos dados">
        <div><Database aria-hidden="true" /><span><strong>{Intl.NumberFormat("pt-BR").format(initialSummary.records)}</strong><small>registros no recorte</small></span></div>
        <div><CalendarDays aria-hidden="true" /><span><strong>12 meses</strong><small>período analisado</small></span></div>
        <div><span className={`status-dot ${initialSummary.status}`} /><span><strong>{initialSummary.updatedAt ? new Date(initialSummary.updatedAt).toLocaleString("pt-BR") : "Aguardando sincronização"}</strong><small>última atualização</small></span></div>
      </section>

      <div className="filter-bar">
        <label className="inline-search"><Search aria-hidden="true" /><span className="sr-only">Pesquisar no mercado</span><input type="search" placeholder="Pesquise um produto, empresa ou órgão" /></label>
        <button className="button secondary filter-trigger" onClick={() => setFiltersOpen(true)}><Filter aria-hidden="true" />Filtros <span className="filter-count">{chips.length + (selectedUf ? 1 : 0)}</span></button>
      </div>
      <div className="filter-chips" aria-label="Filtros ativos">
        {selectedUf && <button onClick={() => setSelectedUf(undefined)}>{selectedUf}<X aria-hidden="true" /></button>}
        {chips.map((chip) => <button key={chip} onClick={() => setChips((items) => items.filter((item) => item !== chip))}>{chip}<X aria-hidden="true" /></button>)}
      </div>

      {initialSummary.message && <div className="data-notice"><Info aria-hidden="true" /><span><strong>Dados ainda não disponíveis</strong>{initialSummary.message}. Os indicadores permanecem zerados para não apresentar informações fictícias.</span></div>}

      <section className="kpi-grid" aria-label="Indicadores de mercado">
        {kpiDefinitions.map(([key, label, methodology, type]) => (
          <article className="kpi-card" key={key}>
            <div className="kpi-label"><span>{label}</span><button className="info-button" aria-label={`Metodologia: ${methodology}`} title={methodology}><Info aria-hidden="true" /></button></div>
            <strong>{format(initialSummary.kpis[key] ?? 0, type)}</strong>
            <small>{initialSummary.records ? "Calculado no recorte atual" : "Sem registros válidos"}</small>
          </article>
        ))}
      </section>

      <section className="analytics-grid">
        <article className="panel chart-panel">
          <div className="panel-head"><div><p className="panel-title">Evolução do mercado</p><small>Valor homologado por mês</small></div><button className="select-button">Mensal<ChevronDown aria-hidden="true" /></button></div>
          <MarketChart data={initialSummary.timeline} />
        </article>
        <article className="panel map-panel">
          <div className="panel-head"><div><p className="panel-title">Volume por estado</p><small>Selecione um estado para filtrar</small></div>{selectedUf && <button className="text-button" onClick={() => setSelectedUf(undefined)}>Limpar</button>}</div>
          <BrazilMap selected={selectedUf} values={initialSummary.stateValues} onSelect={setSelectedUf} />
        </article>
      </section>

      <section className="ranking-grid">
        {([["Empresas vencedoras", initialSummary.rankings.suppliers, "vitórias"], ["Produtos", initialSummary.rankings.products, "licitações"], ["Órgãos compradores", initialSummary.rankings.organizations, "licitações"]] as const).map(([title, items, unit]) => {
          const max = Math.max(1, ...items.map((item) => item.value));
          return <article className="panel ranking" key={title}><div className="panel-head"><div><p className="panel-title">{title}</p><small>Por valor homologado no recorte</small></div></div>
            {items.length === 0 ? <div className="empty-inline"><Database aria-hidden="true" /><span>Sem dados neste recorte</span></div> : <ol className="rank-list">{items.map((item, index) => <li key={item.label}><span className="rank-pos">{index + 1}</span><div className="rank-body"><strong title={item.label}>{item.label}</strong><span className="rank-bar" aria-hidden="true"><i style={{ width: `${Math.max(4, (item.value / max) * 100)}%` }} /></span></div><div className="rank-value"><strong>{format(item.value, "currency")}</strong>{item.detail && <small>{item.detail} {unit}</small>}</div></li>)}</ol>}
          </article>;
        })}
      </section>

      {filtersOpen && <div className="drawer-layer"><button className="drawer-scrim" aria-label="Fechar filtros" onClick={() => setFiltersOpen(false)} /><aside className="filter-drawer" role="dialog" aria-modal="true" aria-labelledby="filter-title"><div className="drawer-head"><div><p className="eyebrow">RECORTE ANALÍTICO</p><h2 id="filter-title">Filtros avançados</h2></div><button className="icon-button" onClick={() => setFiltersOpen(false)} aria-label="Fechar filtros"><X aria-hidden="true" /></button></div><form onSubmit={applyFilters}><div className="filter-fields"><div className="field"><label htmlFor="filter-uf">Estado</label><select id="filter-uf" name="uf" defaultValue={selectedUf ?? ""}><option value="">Brasil</option>{["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"].map((uf) => <option key={uf}>{uf}</option>)}</select></div><div className="field"><label htmlFor="filter-city">Município</label><input id="filter-city" name="city" placeholder="Todos os municípios" /></div><div className="field span-2"><label htmlFor="filter-product">Produto ou descrição</label><input id="filter-product" name="product" placeholder="Ex.: papel A4, CATMAT 461828" /></div><div className="field"><label htmlFor="filter-category">Categoria</label><input id="filter-category" name="category" placeholder="Todas as categorias" /></div><div className="field"><label htmlFor="filter-period">Período</label><select id="filter-period" name="period" defaultValue="Últimos 12 meses"><option>Últimos 7 dias</option><option>Últimos 30 dias</option><option>Últimos 90 dias</option><option>Últimos 6 meses</option><option>Últimos 12 meses</option><option>Últimos 24 meses</option><option>Últimos 36 meses</option></select></div><div className="field"><label htmlFor="filter-org">Órgão</label><input id="filter-org" name="organization" placeholder="Nome ou CNPJ" /></div><div className="field"><label htmlFor="filter-supplier">Fornecedor</label><input id="filter-supplier" name="supplier" placeholder="Razão social ou CNPJ" /></div><div className="field"><label htmlFor="filter-modality">Modalidade</label><select id="filter-modality" name="modality"><option>Todas</option><option>Pregão eletrônico</option><option>Concorrência</option><option>Dispensa</option><option>Inexigibilidade</option></select></div><div className="field"><label htmlFor="filter-status">Situação</label><select id="filter-status" name="status"><option>Todas</option><option>Aberta</option><option>Homologada</option><option>Deserta</option><option>Fracassada</option><option>Anulada</option></select></div><div className="field"><label htmlFor="filter-min">Valor mínimo</label><input id="filter-min" name="min" type="number" min="0" inputMode="decimal" /></div><div className="field"><label htmlFor="filter-max">Valor máximo</label><input id="filter-max" name="max" type="number" min="0" inputMode="decimal" /></div></div><div className="drawer-actions"><button type="button" className="button ghost" onClick={() => setChips([])}>Limpar filtros</button><button type="submit" className="button primary">Aplicar filtros</button></div></form></aside></div>}
    </>
  );
}
