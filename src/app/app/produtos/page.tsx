import type { Metadata } from "next";
import Link from "next/link";
import { Boxes, Search } from "lucide-react";
import { ProductCard, type ProductGroupRow } from "@/components/products/product-card";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Produtos" };
export const dynamic = "force-dynamic";

const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];
const PAGE = 30;

type Params = { q?: string; niche?: string; uf?: string; page?: string };

function href(params: Params, patch: Partial<Params>) {
  const next = { ...params, ...patch };
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(next)) if (value) query.set(key, String(value));
  const text = query.toString();
  return `/app/produtos${text ? `?${text}` : ""}`;
}

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const values = await searchParams;
  const q = (values.q ?? "").trim().slice(0, 100);
  const uf = values.uf && UFS.includes(values.uf.toUpperCase()) ? values.uf.toUpperCase() : "";
  const niche = (values.niche ?? "").slice(0, 60);
  const page = Math.max(1, Number.parseInt(values.page ?? "1", 10) || 1);
  const params: Params = { q: q || undefined, niche: niche || undefined, uf: uf || undefined };

  const supabase = await createClient();
  const [list, niches] = supabase ? await Promise.all([
    supabase.rpc("search_product_groups", { p_text: q || null, p_niche: niche || null, p_state: uf || null, p_limit: PAGE, p_offset: (page - 1) * PAGE }),
    supabase.rpc("product_group_niches", { p_state: uf || null }),
  ]) : [{ data: [], error: null }, { data: [], error: null }];

  const rows = ((list.data ?? []) as Array<ProductGroupRow & { total_count: number }>).map((row) => ({
    ...row,
    min_unit_value: row.min_unit_value === null ? null : Number(row.min_unit_value),
    median_unit_value: row.median_unit_value === null ? null : Number(row.median_unit_value),
    max_unit_value: row.max_unit_value === null ? null : Number(row.max_unit_value),
  }));
  const total = Number(((list.data ?? []) as Array<{ total_count: number }>)[0]?.total_count ?? 0);
  const nicheRows = ((niches.data ?? []) as Array<{ niche: string; groups: number; procurements: number }>).filter((row) => row.niche !== "Outros" || niche === "Outros");
  const pages = Math.max(1, Math.ceil(total / PAGE));

  return <>
    <header className="page-header">
      <div>
        <p className="eyebrow">ANÁLISE</p>
        <h1>Produtos</h1>
        <p>Itens iguais com descrições diferentes reunidos num só produto, por nicho. Abra um produto para ver as licitações, os links dos portais e quem vence nele.</p>
      </div>
    </header>

    <form className="panel product-filters" method="get" action="/app/produtos">
      <label className="inline-search"><Search aria-hidden="true" /><span className="sr-only">Buscar produto</span><input name="q" type="search" defaultValue={q} placeholder="Papel sulfite, fralda, cabo elétrico, locação de veículos…" /></label>
      <select name="niche" aria-label="Nicho" defaultValue={niche}><option value="">Todos os nichos</option>{nicheRows.map((row) => <option key={row.niche} value={row.niche}>{row.niche}</option>)}</select>
      <select name="uf" aria-label="Estado" defaultValue={uf}><option value="">Brasil</option>{UFS.map((code) => <option key={code} value={code}>{code}</option>)}</select>
      <button className="button primary">Buscar</button>
    </form>

    {nicheRows.length > 0 && <nav className="niche-chips" aria-label="Nichos">
      <Link className={!niche ? "active" : ""} href={href(params, { niche: undefined, page: undefined })}>Todos</Link>
      {nicheRows.slice(0, 14).map((row) => <Link key={row.niche} className={niche === row.niche ? "active" : ""} href={href(params, { niche: row.niche, page: undefined })}>{row.niche}<small>{Number(row.groups).toLocaleString("pt-BR")}</small></Link>)}
    </nav>}

    {rows.length === 0 ? <section className="panel module-empty">
      <div className="module-empty-icon"><Boxes aria-hidden="true" /></div>
      <h2>{q || niche || uf ? "Nenhum produto neste recorte" : "Os produtos ainda estão sendo agrupados"}</h2>
      <p>{q || niche || uf ? "Tente outra palavra, outro nicho ou tire o filtro de estado." : "Assim que a coleta traz os itens das licitações, eles aparecem aqui, já reunidos por produto e nicho."}</p>
      {(q || niche || uf) && <Link className="button primary" href="/app/produtos">Limpar filtros</Link>}
    </section> : <>
      <p className="product-count">{total.toLocaleString("pt-BR")} produtos{niche ? ` em ${niche}` : ""}{uf ? ` · ${uf}` : ""}</p>
      <ol className="product-list">{rows.map((row) => <ProductCard key={row.id} group={row} uf={uf || undefined} />)}</ol>
      {pages > 1 && <nav className="pagination" aria-label="Páginas">
        {page > 1 ? <Link className="button secondary" href={href(params, { page: String(page - 1) })}>Anterior</Link> : <span />}
        <span>Página {page} de {pages}</span>
        {page < pages ? <Link className="button secondary" href={href(params, { page: String(page + 1) })}>Próxima</Link> : <span />}
      </nav>}
    </>}
  </>;
}
