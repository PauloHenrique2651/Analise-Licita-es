"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Filter, Gavel, PackageSearch } from "lucide-react";

export type ProcurementItemView = {
  id: string;
  itemNumber: number;
  description: string;
  code: string | null;
  unit: string | null;
  quantity: number | null;
  unitValue: number | null;
  totalValue: number | null;
  status: string | null;
  hasResult: boolean;
};

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const number = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 });

export function ProcurementItems({ items }: { items: ProcurementItemView[] }) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState("");
  const [code, setCode] = useState("");
  const [minValue, setMinValue] = useState("");
  const [maxValue, setMaxValue] = useState("");
  const [result, setResult] = useState("all");

  const statuses = useMemo(() => [...new Set(items.map((item) => item.status).filter(Boolean) as string[])].sort(), [items]);
  const filtered = useMemo(() => items.filter((item) => {
    const haystack = `${item.itemNumber} ${item.description} ${item.code ?? ""}`.toLocaleLowerCase("pt-BR");
    const value = item.totalValue ?? item.unitValue;
    return (!text || haystack.includes(text.toLocaleLowerCase("pt-BR")))
      && (!status || item.status === status)
      && (!code || item.code?.toLocaleLowerCase("pt-BR").includes(code.toLocaleLowerCase("pt-BR")))
      && (!minValue || (value !== null && value >= Number(minValue)))
      && (!maxValue || (value !== null && value <= Number(maxValue)))
      && (result === "all" || item.hasResult === (result === "yes"));
  }), [items, text, status, code, minValue, maxValue, result]);

  return (
    <section className="panel procurement-items-panel">
      <div className="panel-head"><div><p className="panel-title">Itens da licitação</p><small>{filtered.length} de {items.length} itens exibidos</small></div><Filter aria-hidden="true" /></div>
      {items.length === 0 ? <div className="module-empty compact"><PackageSearch aria-hidden="true" /><h2>Itens ainda não sincronizados</h2><p>A licitação permanece acessível no portal oficial; os itens aparecerão aqui assim que a fonte os disponibilizar na rotina de enriquecimento.</p></div> : <>
        <div className="item-filters">
          <input type="search" value={text} onChange={(event) => setText(event.target.value)} placeholder="Descrição ou número do item" aria-label="Filtrar itens por descrição" />
          <input value={code} onChange={(event) => setCode(event.target.value)} placeholder="CATMAT, CATSER ou código" aria-label="Filtrar itens por código" />
          <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filtrar itens por situação"><option value="">Todas as situações</option>{statuses.map((option) => <option key={option}>{option}</option>)}</select>
          <select value={result} onChange={(event) => setResult(event.target.value)} aria-label="Filtrar itens por resultado"><option value="all">Com ou sem resultado</option><option value="yes">Com resultado</option><option value="no">Sem resultado</option></select>
          <input type="number" min="0" step="0.01" value={minValue} onChange={(event) => setMinValue(event.target.value)} placeholder="Valor mínimo" aria-label="Filtrar itens por valor mínimo" />
          <input type="number" min="0" step="0.01" value={maxValue} onChange={(event) => setMaxValue(event.target.value)} placeholder="Valor máximo" aria-label="Filtrar itens por valor máximo" />
        </div>
        {filtered.length === 0 ? <div className="empty-inline tall"><PackageSearch aria-hidden="true" /><span>Nenhum item corresponde aos filtros.</span></div> : <div className="procurement-item-list">{filtered.map((item) => <article key={item.id} className="procurement-item-card">
          <div className="item-card-title"><span>ITEM {item.itemNumber}</span><span className="item-card-actions">{item.status && <span className="status-badge">{item.status}</span>}<Link className="button item-dispute-link" href={`/app/disputa?item=${item.id}`}><Gavel aria-hidden="true" />Preparar disputa</Link></span></div>
          <h3>{item.description}</h3>
          <dl><div><dt>Código</dt><dd>{item.code ?? "Não disponível"}</dd></div><div><dt>Quantidade</dt><dd>{item.quantity === null ? "Não disponível" : `${number.format(item.quantity)} ${item.unit ?? ""}`}</dd></div><div><dt>Valor unitário</dt><dd>{item.unitValue === null ? "Não disponível" : currency.format(item.unitValue)}</dd></div><div><dt>Valor total</dt><dd>{item.totalValue === null ? "Não disponível" : currency.format(item.totalValue)}</dd></div></dl>
        </article>)}</div>}
      </>}
    </section>
  );
}
