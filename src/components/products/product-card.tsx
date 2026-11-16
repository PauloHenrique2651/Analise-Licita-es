"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronDown, ExternalLink, LoaderCircle } from "lucide-react";

export type ProductGroupRow = {
  id: string; name: string; niche: string; item_count: number; procurement_count: number; description_variants: number;
  unit: string | null; min_unit_value: number | null; median_unit_value: number | null; max_unit_value: number | null;
  last_seen_at: string | null; states: string[] | null;
};
type Appearance = {
  procurementId: string; controlNumber: string; object: string; agency: string | null; state: string | null; city: string | null;
  publishedAt: string | null; status: string | null; portal: string | null; officialUrl: string | null;
  itemDescription: string; quantity: number | null; unit: string | null; unitValue: number | null;
};

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const date = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });

export function ProductCard({ group, uf }: { group: ProductGroupRow; uf?: string }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Appearance[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (!next || rows) return;
    setLoading(true); setFailed(false);
    try {
      const params = new URLSearchParams({ limit: "8" }); if (uf) params.set("uf", uf);
      const response = await fetch(`/api/product-groups/${group.id}/procurements?${params}`, { cache: "no-store" });
      const payload = await response.json() as { data?: Appearance[]; total?: number };
      if (!response.ok) throw new Error("falha");
      setRows(payload.data ?? []); setTotal(payload.total ?? 0);
    } catch { setFailed(true); } finally { setLoading(false); }
  }

  return <li className={`product-card ${open ? "open" : ""}`}>
    <div className="product-card-head">
      <div className="product-card-title">
        <Link href={`/app/produtos/${group.id}${uf ? `?uf=${uf}` : ""}`}><strong>{group.name}</strong></Link>
        <span className="niche-badge">{group.niche}</span>
      </div>
      <dl className="product-card-stats">
        <div><dt>Licitações</dt><dd>{group.procurement_count.toLocaleString("pt-BR")}</dd></div>
        <div><dt>Descrições reunidas</dt><dd>{group.description_variants.toLocaleString("pt-BR")}</dd></div>
        <div><dt>Preço típico{group.unit ? ` / ${group.unit}` : ""}</dt><dd>{group.median_unit_value !== null ? money.format(group.median_unit_value) : "—"}</dd>
          {group.min_unit_value !== null && group.max_unit_value !== null && <small>{money.format(group.min_unit_value)} a {money.format(group.max_unit_value)}</small>}</div>
      </dl>
      <button type="button" className="button secondary product-toggle" aria-expanded={open} onClick={toggle}>
        {loading ? <LoaderCircle className="spin" aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}{open ? "Fechar" : "Ver licitações"}
      </button>
    </div>
    {group.states && group.states.length > 0 && <p className="product-card-states">Aparece em: {group.states.join(", ")}{group.last_seen_at ? ` · última em ${date.format(new Date(group.last_seen_at))}` : ""}</p>}

    {open && <div className="product-card-body">
      {failed ? <p className="field-error" role="alert">Não foi possível carregar as licitações. Tente de novo.</p>
        : loading || !rows ? <p className="muted">Carregando…</p>
        : rows.length === 0 ? <p className="muted">Nenhuma licitação neste recorte.</p>
        : <>
          <ul className="appearance-list">{rows.map((row, index) => <li key={`${row.procurementId}-${index}`}>
            <div className="appearance-main">
              <Link href={`/app/licitacoes/${row.procurementId}`}><strong>{row.controlNumber}</strong></Link>
              <span>{row.agency ?? "Órgão não informado"}{row.state ? ` · ${row.city ? `${row.city}/` : ""}${row.state}` : ""}{row.publishedAt ? ` · ${date.format(new Date(row.publishedAt))}` : ""}</span>
              <small title={row.itemDescription}>Item: {row.itemDescription}</small>
            </div>
            <div className="appearance-side">
              <strong>{row.unitValue !== null && row.unitValue > 0 ? `${money.format(row.unitValue)}${row.unit ? ` / ${row.unit}` : ""}` : "valor não informado"}</strong>
              {row.officialUrl ? <a className="button secondary" href={row.officialUrl} target="_blank" rel="noopener noreferrer">{row.portal ? `Abrir no ${row.portal.replace(/^Portal Nacional de Contrata[çc][õo]es P[úu]blicas$/i, "PNCP")}` : "Portal oficial"}<ExternalLink aria-hidden="true" /></a> : <span className="muted">sem link do portal</span>}
            </div>
          </li>)}</ul>
          <p className="product-card-more">{total > rows.length ? `Mostrando ${rows.length} de ${total.toLocaleString("pt-BR")}. ` : ""}<Link href={`/app/produtos/${group.id}${uf ? `?uf=${uf}` : ""}`}>Abrir análise completa do produto</Link></p>
        </>}
    </div>}
  </li>;
}
