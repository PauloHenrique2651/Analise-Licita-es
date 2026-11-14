import type { Metadata } from "next";
import Link from "next/link";
import { CircleAlert, MapPinned, PackageSearch, Search } from "lucide-react";
import type { CatalogSearchItem } from "@/app/api/catalog/search/route";
import { CatalogPicker } from "@/components/prices/catalog-picker";
import { createClient } from "@/lib/supabase/server";
import { getRegionalPriceAnalysis, type CatalogKind, type GroupRow, type RegionalPriceFilters } from "@/services/regional-price-service";

export const metadata: Metadata = { title: "Preços por região" };

const UFS = ["AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO"];

type SearchParams = { q?: string; tipo?: string; codigo?: string; uf?: string; municipio?: string; de?: string; ate?: string; unidade?: string };

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
const compactCurrency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const dateFormat = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });

function formatDate(value: string | null) {
  if (!value) return "—";
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? value : dateFormat.format(parsed);
}

function parseFilters(values: SearchParams): RegionalPriceFilters | null {
  const code = values.codigo?.replace(/\D/g, "") ?? "";
  if (!code || code.length > 9) return null;
  const kind: CatalogKind = values.tipo === "servico" ? "servico" : "material";
  const uf = values.uf && UFS.includes(values.uf) ? values.uf : undefined;
  const municipio = uf && /^\d{7}$/.test(values.municipio ?? "") ? values.municipio : undefined;
  const isDate = (value?: string) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined);
  const unit = values.unidade && /^[A-Za-z0-9 ./-]{1,20}$/.test(values.unidade) ? values.unidade : undefined;
  return { kind, code, uf, municipio, from: isDate(values.de), to: isDate(values.ate), unit };
}

function hrefWith(filters: RegionalPriceFilters, changes: Partial<Record<keyof SearchParams, string | undefined>>) {
  const params = new URLSearchParams();
  const base: SearchParams = { tipo: filters.kind, codigo: filters.code, uf: filters.uf, municipio: filters.municipio, de: filters.from, ate: filters.to, unidade: filters.unit };
  for (const [key, value] of Object.entries({ ...base, ...changes })) if (value) params.set(key, value);
  return `/app/precos-regionais?${params.toString()}`;
}

function GroupTable({ title, caption, rows, firstColumn, linkFor }: { title: string; caption: string; rows: GroupRow[]; firstColumn: string; linkFor?: (row: GroupRow) => string }) {
  return (
    <section className="panel">
      <div className="panel-head"><div><p className="panel-title">{title}</p><small>{caption}</small></div></div>
      {rows.length === 0 ? <div className="empty-inline">Sem registros para este recorte.</div> : (
        <div className="table-scroll">
          <table className="compact-table">
            <thead><tr><th>{firstColumn}</th><th>Compras</th><th>Mediana</th><th>Mín.</th><th>Máx.</th><th>Volume</th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <td>{linkFor ? <Link href={linkFor(row)}>{row.label}</Link> : row.label}{row.detail && <small className="cell-detail">{row.detail}</small>}</td>
                  <td>{integer.format(row.purchases)}</td>
                  <td>{currency.format(row.median)}</td>
                  <td>{currency.format(row.min)}</td>
                  <td>{currency.format(row.max)}</td>
                  <td>{compactCurrency.format(row.totalValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default async function RegionalPricesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const values = await searchParams;
  const filters = parseFilters(values);
  const selectedUf = values.uf && UFS.includes(values.uf) ? values.uf : "";

  const supabase = await createClient();
  const { data: cityRows } = selectedUf
    ? await supabase.from("cities").select("ibge_code,name").eq("state_code", selectedUf).order("name").limit(1000)
    : { data: [] as Array<{ ibge_code: string; name: string }> };
  const cities = (cityRows ?? []) as Array<{ ibge_code: string; name: string }>;

  const searchTerm = (values.q ?? "").trim().slice(0, 120);
  const { data: matchRows } = !filters && searchTerm.length >= 2
    ? await supabase.rpc("search_catalog_items", { p_query: searchTerm, p_kind: null, p_limit: 30 })
    : { data: [] };
  const matches = (matchRows ?? []) as CatalogSearchItem[];

  const analysis = filters ? await getRegionalPriceAnalysis(filters) : null;
  const stats = analysis?.stats;
  const scope = filters?.municipio
    ? cities.find((city) => city.ibge_code === filters.municipio)?.name ?? "Município selecionado"
    : filters?.uf ?? "Brasil";

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Preços por região</h1>
          <p>Quanto os órgãos pagaram por um item do catálogo federal, em cada estado e município, e quem forneceu.</p>
        </div>
      </header>

      <form className="panel regional-form" method="get" action="/app/precos-regionais">
        <CatalogPicker
          initialQuery={values.q ?? ""}
          initialKind={(filters?.kind ?? values.tipo) === "servico" ? "servico" : "material"}
          initialCode={filters?.code ?? ""}
        />
        <div className="field">
          <label htmlFor="regional-uf">Estado</label>
          <select id="regional-uf" name="uf" defaultValue={selectedUf}>
            <option value="">Todos</option>
            {UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="regional-city">Município</label>
          <select id="regional-city" name="municipio" defaultValue={filters?.municipio ?? ""} disabled={!selectedUf}>
            <option value="">{selectedUf ? "Todos do estado" : "Escolha um estado"}</option>
            {cities.map((city) => <option key={city.ibge_code} value={city.ibge_code}>{city.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="regional-from">Compras de</label>
          <input id="regional-from" name="de" type="date" defaultValue={filters?.from ?? ""} />
        </div>
        <div className="field">
          <label htmlFor="regional-to">até</label>
          <input id="regional-to" name="ate" type="date" defaultValue={filters?.to ?? ""} />
        </div>
        <button className="button primary" type="submit"><Search aria-hidden="true" />Analisar preços</button>
        <p className="regional-hint">Digite o nome e escolha o item na lista, ou informe o código direto. Ao trocar o estado, clique em Analisar para carregar os municípios dele.</p>
      </form>

      {!filters && searchTerm && (
        <section className="panel">
          <div className="panel-head"><div><p className="panel-title">Itens do catálogo para “{searchTerm}”</p><small>Escolha o item exato para ver os preços.</small></div></div>
          {matches.length === 0 ? <div className="empty-inline">Nenhum item com esse nome. Tente outra palavra, um sinônimo ou o código CATMAT/CATSER.</div> : (
            <ul className="catalog-results">
              {matches.map((item) => (
                <li key={`${item.kind}-${item.code}`}>
                  <Link href={`/app/precos-regionais?${new URLSearchParams({ tipo: item.kind, codigo: item.code, q: item.description, ...(selectedUf ? { uf: selectedUf } : {}) }).toString()}`}>
                    <strong>{item.description}</strong>
                    <small>{item.kind === "material" ? "CATMAT" : "CATSER"} {item.code}{item.class_name ? ` · ${item.class_name}` : ""}{item.active ? "" : " · inativo"}</small>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {!filters && !searchTerm && (
        <section className="panel module-empty">
          <div className="module-empty-icon"><PackageSearch aria-hidden="true" /></div>
          <h2>Informe o código do item para começar</h2>
          <p>Use o código CATMAT (materiais) ou CATSER (serviços) que aparece no edital ou no item da licitação. Exemplo: 150454 é um dispenser de papel toalha.</p>
        </section>
      )}

      {analysis?.error && <div className="form-error regional-notice" role="alert">{analysis.error}</div>}

      {filters && analysis && !analysis.error && !stats && (
        <section className="panel module-empty">
          <div className="module-empty-icon"><MapPinned aria-hidden="true" /></div>
          <h2>Nenhuma compra encontrada</h2>
          <p>O Painel de Preços não tem compras homologadas deste item em {scope} no período escolhido. Amplie o recorte para o estado ou para todo o Brasil.</p>
          {(filters.municipio || filters.uf) && <Link className="button" href={hrefWith(filters, filters.municipio ? { municipio: undefined } : { uf: undefined, municipio: undefined })}>Ampliar recorte</Link>}
        </section>
      )}

      {analysis && stats && (
        <>
          <div className="regional-summary">
            <div>
              <h2>{analysis.itemDescription ?? `Item ${filters!.code}`}</h2>
              <p>{filters!.kind === "material" ? "CATMAT" : "CATSER"} {filters!.code} · {scope} · {integer.format(analysis.analyzed)} compras analisadas{analysis.selectedUnit ? ` na unidade ${analysis.selectedUnit}` : ""}{analysis.truncated ? ` (amostra de ${integer.format(analysis.totalAvailable)})` : ""}</p>
            </div>
            {(filters!.uf || filters!.municipio) && <Link className="button" href={hrefWith(filters!, { uf: undefined, municipio: undefined })}>Ver Brasil inteiro</Link>}
          </div>

          {analysis.truncated && <div className="data-notice regional-notice"><CircleAlert aria-hidden="true" /><span><strong>Amostra parcial</strong>Este item tem mais compras do que o limite de uma consulta. Filtre por estado ou período para ver o recorte completo.</span></div>}
          {analysis.units.length > 1 && (
            <nav className="unit-filter" aria-label="Unidade de fornecimento">
              <div className="unit-filter-head">
                <strong>Unidade de fornecimento</strong>
                <span>{analysis.selectedUnit
                  ? `${analysis.unitAuto ? "Mostrando a unidade mais frequente" : "Mostrando"}: preços de ${analysis.selectedUnit}${analysis.units.find((unit) => unit.unit === analysis.selectedUnit)?.name ? ` (${analysis.units.find((unit) => unit.unit === analysis.selectedUnit)?.name?.toLowerCase()})` : ""}. Unidades diferentes não são comparáveis entre si.`
                  : "Todas as unidades misturadas: use só para ter noção de volume, não de preço."}</span>
              </div>
              <ul>
                {analysis.units.map((unit) => (
                  <li key={unit.unit}>
                    <Link className={analysis.selectedUnit === unit.unit ? "active" : undefined} aria-current={analysis.selectedUnit === unit.unit ? "true" : undefined} href={hrefWith(filters!, { unidade: unit.unit })} title={unit.name ?? undefined}>
                      {unit.unit}<small>{integer.format(unit.purchases)}</small>
                    </Link>
                  </li>
                ))}
                <li>
                  <Link className={analysis.selectedUnit === null ? "active" : undefined} aria-current={analysis.selectedUnit === null ? "true" : undefined} href={hrefWith(filters!, { unidade: "todas" })}>
                    Todas<small>{integer.format(analysis.units.reduce((sum, unit) => sum + unit.purchases, 0))}</small>
                  </Link>
                </li>
              </ul>
            </nav>
          )}

          <section className="kpi-grid regional-kpis" aria-label="Indicadores de preço">
            <article className="kpi-card"><div className="kpi-label">Preço mediano</div><strong>{currency.format(stats.median)}</strong><small>metade das compras pagou até este valor</small></article>
            <article className="kpi-card"><div className="kpi-label">Faixa típica</div><strong>{currency.format(stats.p25)} – {currency.format(stats.p75)}</strong><small>50% centrais das compras</small></article>
            <article className="kpi-card"><div className="kpi-label">Menor preço</div><strong>{currency.format(stats.min)}</strong><small>unitário homologado</small></article>
            <article className="kpi-card"><div className="kpi-label">Maior preço</div><strong>{currency.format(stats.max)}</strong><small>unitário homologado</small></article>
            <article className="kpi-card"><div className="kpi-label">Média ponderada</div><strong>{currency.format(stats.weightedAverage)}</strong><small>pela quantidade comprada</small></article>
            <article className="kpi-card"><div className="kpi-label">Volume comprado</div><strong>{compactCurrency.format(stats.totalValue)}</strong><small>{integer.format(stats.quantity)} unidades</small></article>
          </section>

          <div className="regional-grid">
            <GroupTable title="Por estado" caption="Clique em um estado para detalhar os municípios." rows={analysis.byState} firstColumn="Estado" linkFor={filters!.uf ? undefined : (row) => hrefWith(filters!, { uf: row.key, municipio: undefined })} />
            <GroupTable title="Por município" caption="Municípios com maior volume comprado." rows={analysis.byCity} firstColumn="Município" linkFor={(row) => hrefWith(filters!, { uf: row.detail, municipio: row.key })} />
            <GroupTable title="Fornecedores" caption="Quem mais vendeu este item no recorte." rows={analysis.suppliers} firstColumn="Fornecedor" />
            {filters!.kind === "material" && <GroupTable title="Marcas" caption="Marcas informadas nas propostas vencedoras." rows={analysis.brands} firstColumn="Marca" />}
          </div>

          <section className="panel">
            <div className="panel-head"><div><p className="panel-title">Compras recentes</p><small>As 25 compras homologadas mais recentes do recorte.</small></div></div>
            <div className="table-scroll">
              <table className="compact-table">
                <thead><tr><th>Data</th><th>Órgão</th><th>Local</th><th>Fornecedor</th><th>Marca</th><th>Qtd.</th><th>Preço unitário</th></tr></thead>
                <tbody>
                  {analysis.recent.map((row) => (
                    <tr key={row.id}>
                      <td>{formatDate(row.date)}</td>
                      <td>{row.buyer}</td>
                      <td>{row.municipio ? `${row.municipio.split("|")[1]}/${row.uf ?? ""}` : row.uf ?? "—"}</td>
                      <td>{row.supplier}</td>
                      <td>{row.brand ?? "—"}</td>
                      <td>{integer.format(row.quantity)} {row.unit ?? ""}</td>
                      <td>{currency.format(row.unitPrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <p className="regional-source">Fonte: Painel de Preços, API de Dados Abertos do Compras.gov.br. Inclui órgãos federais e os estados e municípios que compram pelo sistema.</p>
        </>
      )}
    </>
  );
}
