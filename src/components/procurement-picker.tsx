"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Search, X } from "lucide-react";

export type ProcurementOption = { id: string; controlNumber: string; object: string; agency: string | null; origin: "oportunidade" | "favorito" | "busca" };
const originLabel: Record<ProcurementOption["origin"], string> = { oportunidade: "Minha oportunidade", favorito: "Favorito", busca: "" };

async function fetchOptions(query: string): Promise<ProcurementOption[]> {
  const response = await fetch(`/api/client-portals/options?q=${encodeURIComponent(query)}`, { cache: "no-store" });
  const payload = await response.json().catch(() => ({})) as { data?: ProcurementOption[] };
  if (!response.ok) throw new Error("busca indisponível");
  return payload.data ?? [];
}

/** Busca de processo: sugere oportunidades/favoritos da empresa e pesquisa por número, objeto ou órgão. */
export function ProcurementPicker({ value, onChange }: { value: ProcurementOption | null; onChange: (option: ProcurementOption | null) => void }) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<ProcurementOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const request = useRef(0);
  const root = useRef<HTMLDivElement>(null);

  // Fecha ao tocar fora. Não usa onBlur: no Safari do iPhone o toque numa opção tira o foco do campo
  // antes do clique, e a lista sumia sem selecionar.
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (root.current && !root.current.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  useEffect(() => {
    if (value) return;
    const id = ++request.current;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const data = await fetchOptions(query.trim());
        if (id === request.current) { setOptions(data); setActive(0); }
      } catch { if (id === request.current) setOptions([]); }
      finally { if (id === request.current) setLoading(false); }
    }, query.trim().length >= 3 ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [query, value]);

  if (value) {
    return <div className="picker-selected"><div><strong>{value.controlNumber}</strong><p>{value.object}</p>{value.agency && <small>{value.agency}</small>}</div><button type="button" className="icon-button" onClick={() => { onChange(null); setQuery(""); setOpen(true); }} aria-label="Trocar processo"><X aria-hidden="true" /></button></div>;
  }
  const hint = query.trim().length > 0 && query.trim().length < 3 ? "Digite ao menos 3 caracteres." : !loading && options.length === 0 ? (query.trim() ? "Nenhum processo encontrado. Tente o número do controle PNCP ou outra palavra do objeto." : "Você ainda não tem oportunidades ou favoritos. Pesquise pelo número, objeto ou órgão.") : null;
  return <div className="picker" ref={root}>
    <div className="picker-input input-with-icon"><Search aria-hidden="true" />
      <input id="portal-procurement" role="combobox" aria-expanded={open} aria-controls="portal-procurement-list" aria-autocomplete="list" autoComplete="off"
        placeholder="Número do controle PNCP, objeto ou órgão" value={query} onFocus={() => setOpen(true)}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") { event.preventDefault(); setActive((index) => Math.min(index + 1, options.length - 1)); }
          else if (event.key === "ArrowUp") { event.preventDefault(); setActive((index) => Math.max(index - 1, 0)); }
          else if (event.key === "Enter" && open && options[active]) { event.preventDefault(); onChange(options[active]); setQuery(""); setOpen(false); }
          else if (event.key === "Escape") setOpen(false);
        }} />
      {loading && <LoaderCircle className="spin" aria-hidden="true" />}
    </div>
    {open && <div className="picker-list" id="portal-procurement-list" role="listbox">
      {!query.trim() && options.length > 0 && <p className="picker-caption">Suas oportunidades e favoritos</p>}
      {options.map((option, index) => <button type="button" role="option" aria-selected={index === active} key={option.id} className={index === active ? "active" : ""} onMouseEnter={() => setActive(index)} onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange(option); setQuery(""); setOpen(false); }}>
        <span><strong>{option.controlNumber}</strong>{originLabel[option.origin] && <em>{originLabel[option.origin]}</em>}</span>
        <p>{option.object}</p>{option.agency && <small>{option.agency}</small>}
      </button>)}
      {hint && <p className="picker-caption">{hint}</p>}
    </div>}
  </div>;
}

