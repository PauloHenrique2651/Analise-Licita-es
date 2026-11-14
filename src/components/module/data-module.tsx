import { Box, ChevronLeft, ChevronRight, CircleDollarSign, Database, ExternalLink, MapPinned, Rows3, Search } from "lucide-react";
import Link from "next/link";
import { DetailLink } from "@/components/procurement/detail-link";
import type { AnalysisTable } from "@/services/analysis-service";

function procurementIdFromHref(href: unknown) {
  const match = typeof href === "string" ? href.match(/^\/app\/licitacoes\/([0-9a-f-]{36})$/i) : null;
  return match ? match[1] : null;
}

type ModuleProps = {
  title: string;
  description: string;
  search?: string;
  label?: string;
  query: string;
  table: AnalysisTable;
  filters?: Record<string, string | undefined>;
  showProcurementFilters?: boolean;
  showProductFilters?: boolean;
  currentPage?: number;
};

const PAGE_SIZE = 25;
const states = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];

function renderValue(value: string | number | null, format?: "currency" | "number" | "date" | "external") {
  if (value === null || value === "") return "Não disponível";
  if (format === "currency") return Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value));
  if (format === "number") return Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(Number(value));
  if (format === "date") return new Date(String(value)).toLocaleDateString("pt-BR");
  return String(value);
}

function compactNumber(value: number) {
  return Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function compactCurrency(value: number) {
  return Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function pageHref(page: number, query: string, filters: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  for (const [key, value] of Object.entries(filters)) {
    if (key !== "page" && value) params.set(key, value);
  }
  if (page > 1) params.set("page", String(page));
  const search = params.toString();
  return search ? `?${search}` : "?";
}

export function DataModule({
  title,
  description,
  search,
  label = "ANÁLISE",
  query,
  table,
  filters = {},
  showProcurementFilters = false,
  showProductFilters = false,
  currentPage = 1,
}: ModuleProps) {
  const totalRows = table.rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const page = Math.min(Math.max(1, currentPage), totalPages);
  const start = (page - 1) * PAGE_SIZE;
  const visibleRows = table.rows.slice(start, start + PAGE_SIZE);
  const activeFilters = ["uf", "city", "agency", "cnpj", "modality", "portal", "status", "from", "to", "proposalUntil", "minValue", "maxValue", "dispute", "meEpp", "kind", "open"].filter((key) => Boolean(filters[key])).length;
  const end = Math.min(start + PAGE_SIZE, totalRows);

  const productSummary = showProductFilters ? {
    products: totalRows,
    procurements: table.rows.reduce((sum, row) => sum + Number(row.procurements ?? 0), 0),
    states: new Set(table.rows.map((row) => row.uf).filter(Boolean)).size,
    value: table.rows.reduce((sum, row) => sum + Number(row.value ?? 0), 0),
  } : null;

  return (
    <>
      <header className="page-header"><div><p className="eyebrow">{label}</p><h1>{title}</h1><p>{description}</p></div></header>

      {productSummary && <section className="product-summary-grid" aria-label="Resumo do recorte de produtos">
        <article className="panel product-summary-card"><Box aria-hidden="true" /><span>Descrições consolidadas</span><strong>{compactNumber(productSummary.products)}</strong><small>No recorte carregado</small></article>
        <article className="panel product-summary-card"><Rows3 aria-hidden="true" /><span>Processos relacionados</span><strong>{compactNumber(productSummary.procurements)}</strong><small>Soma por produto e UF</small></article>
        <article className="panel product-summary-card"><MapPinned aria-hidden="true" /><span>UFs representadas</span><strong>{productSummary.states}</strong><small>Com localização disponível</small></article>
        <article className="panel product-summary-card featured"><CircleDollarSign aria-hidden="true" /><span>Valor disponível</span><strong title={renderValue(productSummary.value, "currency")}>{compactCurrency(productSummary.value)}</strong><small>Registros com valor informado</small></article>
      </section>}

      {search && <form className={`module-search ${showProcurementFilters ? "with-filters" : ""} ${showProductFilters ? "product-search" : ""}`} method="get">
        <Search aria-hidden="true" />
        <label className="sr-only" htmlFor="module-search">Pesquisar</label>
        <input id="module-search" name="q" type="search" placeholder={search} defaultValue={query} maxLength={120} />
        {showProductFilters && <label className="product-state-filter"><span>Localização</span><select name="uf" defaultValue={filters.uf ?? ""} aria-label="Filtrar produtos por UF"><option value="">Brasil · todas as UFs</option>{states.map((state) => <option value={state} key={state}>{state}</option>)}</select></label>}
        {showProcurementFilters && <details className="procurement-filters-wrap" open={activeFilters > 0}><summary>Filtros{activeFilters > 0 ? <span className="filter-count">{activeFilters}</span> : null}</summary><div className="procurement-filters"><input name="uf" aria-label="UF" placeholder="UF" defaultValue={filters.uf} maxLength={2} /><input name="city" aria-label="Município" placeholder="Município" defaultValue={filters.city} /><input name="agency" aria-label="Órgão" placeholder="Órgão" defaultValue={filters.agency} /><input name="cnpj" aria-label="CNPJ do órgão" placeholder="CNPJ" defaultValue={filters.cnpj} /><input name="modality" aria-label="Modalidade" placeholder="Modalidade" defaultValue={filters.modality} /><select name="portal" aria-label="Portal" defaultValue={filters.portal ?? ""}><option value="">Todos os portais</option><option value="PNCP">PNCP</option><option value="COMPRAS_GOV">Compras.gov.br</option><option value="RJ_DADOS_ABERTOS_SIGA">SIGA/RJ</option></select><input name="status" aria-label="Situação" placeholder="Situação" defaultValue={filters.status} /><label>Publicação inicial<input name="from" type="date" defaultValue={filters.from} /></label><label>Publicação final<input name="to" type="date" defaultValue={filters.to} /></label><label>Propostas até<input name="proposalUntil" type="date" defaultValue={filters.proposalUntil} /></label><input name="minValue" type="number" min="0" step="0.01" aria-label="Valor mínimo" placeholder="Valor mínimo" defaultValue={filters.minValue} /><input name="maxValue" type="number" min="0" step="0.01" aria-label="Valor máximo" placeholder="Valor máximo" defaultValue={filters.maxValue} /><select name="dispute" aria-label="Modo de disputa" defaultValue={filters.dispute ?? ""}><option value="">Qualquer modo de disputa</option><option value="Aberto">Aberto</option><option value="Aberto-Fechado">Aberto-fechado</option><option value="Fechado-Aberto">Fechado-aberto</option><option value="Fechado">Fechado</option><option value="Dispensa Com Disputa">Dispensa com disputa</option><option value="Não se aplica">Não se aplica</option></select><select name="meEpp" aria-label="Participação ME/EPP" defaultValue={filters.meEpp ?? ""}><option value="">ME/EPP: todas</option><option value="exclusiva">Exclusiva ME/EPP</option><option value="com_beneficio">Com benefício ME/EPP</option><option value="sem">Ampla concorrência</option></select><select name="kind" aria-label="Material ou serviço" defaultValue={filters.kind ?? ""}><option value="">Material e serviço</option><option value="material">Material</option><option value="servico">Serviço</option></select><label className="checkbox-label"><input name="open" type="checkbox" value="1" defaultChecked={filters.open === "1"} />Só com propostas abertas</label></div></details>}
        <button className="button primary">Pesquisar</button>
        {(query || filters.uf) && showProductFilters && <Link className="button tertiary" href="/app/produtos">Limpar</Link>}
      </form>}

      <section className={`panel data-table-panel ${showProductFilters ? "product-data-panel" : ""}`}>
        <div className="panel-head"><div><p className="panel-title">{showProductFilters ? "Ranking de demanda" : "Resultados encontrados"}</p><small>{totalRows === 0 ? "Nenhum registro" : `${start + 1}–${end} de ${totalRows} registros carregados`} · dados rastreáveis à fonte</small></div>{showProductFilters && <p className="method-note">Agrupamento exato · sem similaridade presumida</p>}</div>
        {totalRows === 0 ? <div className="module-empty"><div className="module-empty-icon"><Database aria-hidden="true" /></div><h2>Aguardando dados da sincronização</h2><p>{table.message}</p></div> : <div className={`table-scroll ${showProductFilters ? "product-table-scroll" : ""}`}><table><thead><tr>{table.columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead><tbody>{visibleRows.map((row, index) => <tr className={row.href ? "clickable-row" : undefined} key={`${page}-${index}`}>{table.columns.map((column) => <td key={column.key} data-label={column.label}>{showProductFilters && column.key === "product" ? <div className="product-name-cell"><span>{String(start + index + 1).padStart(2, "0")}</span><strong>{renderValue(row[column.key], column.format)}</strong></div> : column.format === "external" ? (row[column.key] ? <a className="official-table-link" href={String(row[column.key])} target="_blank" rel="noopener noreferrer" aria-label={`Abrir ${String(row.process ?? "")} no portal oficial`}>Acessar<ExternalLink aria-hidden="true" /></a> : "Não disponível") : row.href ? (procurementIdFromHref(row.href) ? <DetailLink procurementId={procurementIdFromHref(row.href)!} ariaLabel={`Abrir licitação ${String(row.process ?? "")}`}>{renderValue(row[column.key], column.format)}</DetailLink> : <Link href={String(row.href)} aria-label={`Abrir ${String(row.process ?? row[column.key] ?? "")}`}>{renderValue(row[column.key], column.format)}</Link>) : renderValue(row[column.key], column.format)}</td>)}</tr>)}</tbody></table></div>}
        {totalRows > PAGE_SIZE && <nav className="table-pagination" aria-label="Paginação dos resultados"><span>Página <strong>{page}</strong> de {totalPages}</span><div>{page > 1 ? <Link className="pagination-button" href={pageHref(page - 1, query, filters)} aria-label="Página anterior"><ChevronLeft aria-hidden="true" />Anterior</Link> : <span className="pagination-button disabled"><ChevronLeft aria-hidden="true" />Anterior</span>}{page < totalPages ? <Link className="pagination-button" href={pageHref(page + 1, query, filters)}>Próxima<ChevronRight aria-hidden="true" /></Link> : <span className="pagination-button disabled">Próxima<ChevronRight aria-hidden="true" /></span>}</div></nav>}
      </section>
    </>
  );
}
