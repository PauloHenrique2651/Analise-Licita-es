import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { PricePosition } from "@/components/products/price-position";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Produto" };
export const dynamic = "force-dynamic";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const date = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });
const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];
const PAGE = 25;
const num = (value: unknown) => (value === null || value === undefined ? null : Number(value));

export default async function ProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ uf?: string; page?: string; municipio?: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const values = await searchParams;
  const uf = values.uf && UFS.includes(values.uf.toUpperCase()) ? values.uf.toUpperCase() : "";
  const page = Math.max(1, Number.parseInt(values.page ?? "1", 10) || 1);
  // Municípios (códigos IBGE separados por vírgula) escolhidos no mapa da análise de mercado
  const cityCodes = [...new Set((values.municipio ?? "").split(",").filter((code) => /^\d{7}$/.test(code)))].slice(0, 50);

  const supabase = await createClient();
  if (!supabase) notFound();
  const { data: groupRows } = await supabase.rpc("get_product_group", { p_group_id: id });
  const group = (groupRows as Array<Record<string, unknown>> | null)?.[0];
  if (!group) notFound();

  const [procurements, suppliers, variants] = await Promise.all([
    supabase.rpc("product_group_procurements", { p_group_id: id, p_state: uf || null, p_limit: PAGE, p_offset: (page - 1) * PAGE, p_cities: cityCodes }),
    supabase.rpc("product_group_suppliers", { p_group_id: id, p_state: uf || null, p_days: 730, p_limit: 8 }),
    supabase.rpc("product_group_variants", { p_group_id: id, p_limit: 8 }),
  ]);
  const { data: cityRows } = cityCodes.length ? await supabase.from("cities").select("ibge_code,name").in("ibge_code", cityCodes) : { data: [] };
  const cityNames = new Map((cityRows ?? []).map((row) => [String(row.ibge_code), String(row.name)]));
  const rows = (procurements.data ?? []) as Array<Record<string, unknown>>;
  const total = Number(rows[0]?.total_count ?? 0);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const winners = (suppliers.data ?? []) as Array<Record<string, unknown>>;
  const names = (variants.data ?? []) as Array<{ description: string; occurrences: number }>;
  const unit = group.unit ? String(group.unit) : null;
  const link = (patch: { uf?: string; page?: number; municipio?: string }) => {
    const query = new URLSearchParams(); const nextUf = patch.uf ?? uf; if (nextUf) query.set("uf", nextUf);
    const nextCities = patch.municipio ?? cityCodes.join(","); if (nextCities) query.set("municipio", nextCities); if (patch.page && patch.page > 1) query.set("page", String(patch.page));
    return `/app/produtos/${id}${query.toString() ? `?${query}` : ""}`;
  };

  return <>
    <Link className="back-link" href="/app/produtos"><ArrowLeft aria-hidden="true" />Produtos</Link>
    <header className="page-header">
      <div>
        <p className="eyebrow">{String(group.niche).toUpperCase()}</p>
        <h1>{String(group.name)}</h1>
        <p>{Number(group.description_variants).toLocaleString("pt-BR")} descrições diferentes reunidas · {Number(group.procurement_count).toLocaleString("pt-BR")} licitações · {Number(group.item_count).toLocaleString("pt-BR")} itens{group.catalog_group ? ` · Catálogo: ${String(group.catalog_group)}` : ""}</p>
      </div>
    </header>

    <div className="product-facts">
      <span><small>Preço típico{unit ? ` / ${unit}` : ""}</small>{num(group.median_unit_value) !== null ? money.format(Number(group.median_unit_value)) : "—"}</span>
      <span><small>Faixa (10% a 90%)</small>{num(group.min_unit_value) !== null && num(group.max_unit_value) !== null ? `${money.format(Number(group.min_unit_value))} – ${money.format(Number(group.max_unit_value))}` : "—"}</span>
      <span><small>Última aparição</small>{group.last_seen_at ? date.format(new Date(String(group.last_seen_at))) : "—"}</span>
      <form method="get" className="product-uf"><label htmlFor="uf"><small>Estado</small></label><select id="uf" name="uf" defaultValue={uf}><option value="">Brasil</option>{UFS.map((code) => <option key={code} value={code}>{code}</option>)}</select><button className="button secondary">Filtrar</button></form>
    </div>

    <div className="product-layout">
      <section className="panel product-appearances">
        <div className="panel-head"><div><p className="panel-title">Licitações em que aparece</p><small>{total.toLocaleString("pt-BR")} {cityCodes.length ? `em ${cityCodes.length === 1 ? (cityNames.get(cityCodes[0]) ?? "1 município") : `${cityCodes.length} municípios`}` : uf ? `em ${uf}` : "no Brasil"} · com o link direto para o portal</small></div></div>
        {cityCodes.length > 0 && <div className="filter-chips" aria-label="Municípios filtrados">{cityCodes.map((code) => <Link key={code} href={link({ municipio: cityCodes.filter((item) => item !== code).join(","), page: 1 })}>{cityNames.get(code) ?? code} ×</Link>)}</div>}
        {rows.length === 0 ? <div className="empty-inline tall"><span>Nenhuma licitação neste recorte.</span></div> : <ul className="appearance-list">{rows.map((row, index) => {
          const official = typeof row.source_url === "string" && /^https?:\/\//.test(row.source_url) ? row.source_url : null;
          const portal = row.source_portal_name ? String(row.source_portal_name).replace(/^Portal Nacional de Contrata[çc][õo]es P[úu]blicas$/i, "PNCP") : null;
          return <li key={`${row.procurement_id}-${index}`}>
            <div className="appearance-main">
              <Link href={`/app/licitacoes/${String(row.procurement_id)}`}><strong>{String(row.control_number)}</strong></Link>
              <span>{row.agency_name ? String(row.agency_name) : "Órgão não informado"}{row.state_code ? ` · ${row.city_name ? `${String(row.city_name)}/` : ""}${String(row.state_code)}` : ""}{row.published_at ? ` · ${date.format(new Date(String(row.published_at)))}` : ""}</span>
              <small title={String(row.item_description ?? "")}>Item: {String(row.item_description ?? "")}</small>
            </div>
            <div className="appearance-side">
              <strong>{num(row.unit_value) ? `${money.format(Number(row.unit_value))}${row.unit ? ` / ${String(row.unit)}` : ""}` : "valor não informado"}</strong>
              {official ? <a className="button secondary" href={official} target="_blank" rel="noopener noreferrer">{portal ? `Abrir no ${portal}` : "Portal oficial"}<ExternalLink aria-hidden="true" /></a> : <span className="muted">sem link do portal</span>}
            </div>
          </li>;
        })}</ul>}
        {pages > 1 && <nav className="pagination" aria-label="Páginas">
          {page > 1 ? <Link className="button secondary" href={link({ page: page - 1 })}>Anterior</Link> : <span />}
          <span>Página {page} de {pages}</span>
          {page < pages ? <Link className="button secondary" href={link({ page: page + 1 })}>Próxima</Link> : <span />}
        </nav>}
      </section>

      <aside className="product-side">
        <section className="panel">
          <div className="panel-head"><div><p className="panel-title">Quem vence neste produto</p><small>Últimos 24 meses{uf ? ` · ${uf}` : ""}</small></div></div>
          {winners.length === 0 ? <div className="empty-inline"><span>Sem vitórias registradas neste recorte.</span></div> : <ol className="price-suppliers padded">{winners.map((row) => <li key={String(row.supplier_id)}>
            <Link href={`/app/concorrentes/${String(row.supplier_id)}`}><strong>{String(row.supplier_name)}</strong></Link>
            <span>{Number(row.wins)} vitória{Number(row.wins) === 1 ? "" : "s"}{num(row.median_unit_value) !== null ? ` · mediana ${money.format(Number(row.median_unit_value))}` : ""}{num(row.min_unit_value) !== null ? ` · menor ${money.format(Number(row.min_unit_value))}` : ""}{Array.isArray(row.states) && row.states.length ? ` · ${(row.states as string[]).join(", ")}` : ""}</span>
          </li>)}</ol>}
        </section>

        <section className="panel">
          <div className="panel-head"><div><p className="panel-title">Posicione o seu preço</p><small>Veja em que posição o seu valor ficaria</small></div></div>
          <PricePosition groupId={id} groupName={String(group.name)} showSuppliers={false} />
        </section>

        {names.length > 0 && <section className="panel">
          <div className="panel-head"><div><p className="panel-title">Também aparece como</p><small>Descrições reunidas neste produto</small></div></div>
          <ul className="variant-list">{names.map((variant) => <li key={variant.description}><span>{variant.description}</span><small>{Number(variant.occurrences).toLocaleString("pt-BR")}×</small></li>)}</ul>
        </section>}
      </aside>
    </div>
  </>;
}
