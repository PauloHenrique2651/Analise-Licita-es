import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { NumbersMap } from "@/components/market/numbers-map";
import { PncpCheck } from "@/components/market/pncp-check";
import { currentYear, getCoverage, getNumbers } from "@/services/numbers-service";

export const metadata: Metadata = { title: "Painel em números" };
export const dynamic = "force-dynamic";

const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];
const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const integer = new Intl.NumberFormat("pt-BR");
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 });

type Search = { ano?: string; mes?: string; uf?: string };

export default async function NumbersPage({ searchParams }: { searchParams: Promise<Search> }) {
  const values = await searchParams;
  const thisYear = currentYear();
  const year = Math.min(thisYear, Math.max(2025, Number.parseInt(values.ano ?? "", 10) || thisYear));
  const month = values.mes && /^(?:[1-9]|1[0-2])$/.test(values.mes) ? Number(values.mes) : undefined;
  const uf = values.uf && UFS.includes(values.uf.toUpperCase()) ? values.uf.toUpperCase() : undefined;
  const [{ states, cities }, coverage] = await Promise.all([getNumbers({ year, month, uf }), getCoverage(14)]);

  const totals = states.reduce((sum, row) => ({ procurements: sum.procurements + row.procurements, items: sum.items + row.items, value: sum.value + row.value }), { procurements: 0, items: 0, value: 0 });
  const scoped = uf ? states.find((row) => row.state === uf) : undefined;
  const view = scoped ?? totals;
  const query = (patch: Search) => {
    const next = new URLSearchParams();
    const merged = { ano: String(year), mes: month ? String(month) : undefined, uf, ...patch };
    for (const [key, value] of Object.entries(merged)) if (value) next.set(key, value);
    return `/app/numeros?${next}`;
  };
  const hrefFor: Record<string, string> = { "": query({ uf: undefined }) };
  for (const code of UFS) hrefFor[code] = query({ uf: uf === code ? undefined : code });
  const mapValues = Object.fromEntries(states.map((row) => [row.state, row.value]));
  const periodLabel = month ? `${MONTHS[month - 1]} de ${year}` : `ano de ${year}`;
  const rows = uf ? cities : states;

  return <>
    <header className="page-header"><div><p className="eyebrow">ANÁLISE</p><h1>Painel em números</h1><p>Contratações publicadas por estado e município, com a conferência ao vivo contra o PNCP.</p></div></header>

    <form method="get" className="filter-bar numbers-filters" aria-label="Filtros do painel">
      <label>Ano<select name="ano" defaultValue={String(year)}>{Array.from({ length: thisYear - 2024 }, (_, index) => thisYear - index).map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      <label>Mês<select name="mes" defaultValue={month ? String(month) : ""}><option value="">Todos</option>{MONTHS.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}</select></label>
      <label>Estado<select name="uf" defaultValue={uf ?? ""}><option value="">Brasil</option>{UFS.map((code) => <option key={code} value={code}>{code}</option>)}</select></label>
      <button className="button primary">Aplicar</button>
      {(month || uf || year !== thisYear) && <Link className="button secondary" href="/app/numeros">Limpar filtros</Link>}
    </form>

    <section className="kpi-grid numbers-kpis" aria-label="Totais do período">
      <article className="kpi-card"><div className="kpi-label"><span>Contratações publicadas</span></div><strong>{integer.format(view.procurements)}</strong><small>{uf ?? "Brasil"} · {periodLabel}</small></article>
      <article className="kpi-card"><div className="kpi-label"><span>Itens publicados</span></div><strong>{integer.format(view.items)}</strong><small>Itens já coletados das contratações</small></article>
      <article className="kpi-card"><div className="kpi-label"><span>Valor publicado</span></div><strong>{compact.format(view.value)}</strong><small>Homologado quando existe, senão estimado</small></article>
      <article className="kpi-card"><div className="kpi-label"><span>{uf ? "Municípios com publicações" : "Estados com publicações"}</span></div><strong>{integer.format(rows.length)}</strong><small>No período escolhido</small></article>
    </section>

    <section className="analytics-grid numbers-grid">
      <article className="panel map-panel">
        <div className="panel-head"><div><p className="panel-title">Valor publicado por estado</p><small>{uf ? `Filtrado em ${uf}: clique de novo para voltar ao Brasil` : "Clique em um estado para ver os municípios"}</small></div>{uf && <Link className="text-button" href={hrefFor[""]}>Limpar</Link>}</div>
        <NumbersMap values={mapValues} selected={uf} hrefFor={hrefFor} />
      </article>
      <article className="panel numbers-table">
        <div className="panel-head"><div><p className="panel-title">{uf ? `Municípios de ${uf}` : "Estados"}</p><small>Ordenado por valor publicado · {periodLabel}</small></div></div>
        {rows.length === 0 ? <div className="empty-inline tall"><span>Nenhuma publicação neste período.</span></div> : <div className="numbers-scroll"><table className="compact-table">
          <thead><tr><th>{uf ? "Município" : "UF"}</th><th className="num">Contratações</th><th className="num">Itens</th><th className="num">Valor publicado</th></tr></thead>
          <tbody>{rows.slice(0, 200).map((row) => <tr key={row.cityIbge ?? row.state}>
            <td>{uf ? row.name : <Link href={hrefFor[row.state]}>{row.state}</Link>}</td>
            <td className="num">{integer.format(row.procurements)}</td><td className="num">{integer.format(row.items)}</td><td className="num">{money.format(row.value)}</td>
          </tr>)}</tbody></table></div>}
      </article>
    </section>

    <section className="panel coverage-panel" aria-label="Cobertura do PNCP por dia">
      <div className="panel-head"><div><p className="panel-title">Cobertura do PNCP, dia a dia</p><small>A conferência automática compara o total oficial com o nosso e busca o que faltar. Últimos 14 dias.</small></div></div>
      {coverage.length === 0 ? <div className="empty-inline"><span>A primeira conferência ainda não terminou.</span></div> : <div className="numbers-scroll"><table className="compact-table">
        <thead><tr><th>Dia</th><th className="num">PNCP (oficial)</th><th className="num">Nosso sistema</th><th className="num">Cobertura</th><th>Conferido em</th></tr></thead>
        <tbody>{coverage.map((row) => { const pct = row.pncp ? Math.min(100, (row.ours / row.pncp) * 100) : 100; return <tr key={row.day}>
          <td>{new Date(`${row.day}T12:00:00-03:00`).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })}</td>
          <td className="num">{integer.format(row.pncp)}</td><td className="num">{integer.format(row.ours)}</td>
          <td className={`num ${pct < 100 ? "neg" : "pos"}`}>{pct >= 100 ? "100%" : `${pct.toFixed(1).replace(".", ",")}%`}</td>
          <td>{row.checkedAt ? new Date(row.checkedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}</td>
        </tr>; })}</tbody></table></div>}
    </section>

    <PncpCheck />
    <p className="muted numbers-note">Para comparar com o painel oficial: <a href="https://www.gov.br/pncp/pt-br/acesso-a-informacao/painel-pncp-em-numeros/contratacoes-publicadas" target="_blank" rel="noopener noreferrer">PNCP em Números<ExternalLink aria-hidden="true" /></a>. O painel oficial soma valores sem descartar erros de digitação dos órgãos; aqui valores acima de R$ 5 bilhões por contratação ficam de fora, e por isso o valor pode diferir. A quantidade de contratações é a que deve bater.</p>
  </>;
}
