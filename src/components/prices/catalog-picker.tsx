"use client";

import { useEffect, useId, useRef, useState } from "react";
import { LoaderCircle, Search } from "lucide-react";

interface CatalogItem {
  kind: "material" | "servico";
  code: string;
  description: string;
  pdm_name: string | null;
  class_name: string | null;
  active: boolean;
}

/** Busca de itens CATMAT/CATSER por nome; ao escolher, preenche tipo e código do formulário. */
export function CatalogPicker({ initialQuery, initialKind, initialCode }: { initialQuery: string; initialKind: "material" | "servico"; initialCode: string }) {
  const listId = useId();
  const [query, setQuery] = useState(initialQuery);
  const [kind, setKind] = useState(initialKind);
  const [code, setCode] = useState(initialCode);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const skipNextSearch = useRef(true);

  useEffect(() => {
    if (skipNextSearch.current) { skipNextSearch.current = false; return; }
    const term = query.trim();
    if (term.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setFailed(false);
      try {
        const response = await fetch(`/api/catalog/search?q=${encodeURIComponent(term)}`, { signal: controller.signal, credentials: "same-origin" });
        if (!response.ok) throw new Error(String(response.status));
        const body = (await response.json()) as { data: CatalogItem[] };
        setItems(body.data);
        setActive(body.data.length ? 0 : -1);
        setOpen(true);
      } catch (error) {
        if ((error as Error).name !== "AbortError") { setFailed(true); setOpen(true); setItems([]); }
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [query]);

  function choose(item: CatalogItem) {
    skipNextSearch.current = true;
    setQuery(item.description);
    setKind(item.kind);
    setCode(item.code);
    setOpen(false);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || !items.length) return;
    if (event.key === "ArrowDown") { event.preventDefault(); setActive((index) => (index + 1) % items.length); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive((index) => (index - 1 + items.length) % items.length); }
    else if (event.key === "Enter" && active >= 0) { event.preventDefault(); choose(items[active]); }
    else if (event.key === "Escape") { setOpen(false); }
  }

  return (
    <>
      <div className="field catalog-search-field">
        <label htmlFor={`${listId}-input`}>Produto ou serviço</label>
        <div className="catalog-search">
          <Search aria-hidden="true" />
          <input
            id={`${listId}-input`}
            name="q"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setCode("");
              if (event.target.value.trim().length < 2) { setItems([]); setOpen(false); }
            }}
            onKeyDown={onKeyDown}
            onFocus={() => { if (items.length) setOpen(true); }}
            onBlur={() => window.setTimeout(() => setOpen(false), 150)}
            placeholder="Ex.: papel toalha, luva nitrílica, limpeza predial"
            autoComplete="off"
            role="combobox"
            aria-expanded={open}
            aria-controls={`${listId}-list`}
            aria-autocomplete="list"
            aria-activedescendant={open && active >= 0 ? `${listId}-option-${active}` : undefined}
          />
          {loading && <LoaderCircle className="spin" aria-hidden="true" />}
        </div>
        {open && (
          <ul className="catalog-options" id={`${listId}-list`} role="listbox" aria-label="Itens do catálogo">
            {failed && <li className="catalog-empty">Não foi possível consultar o catálogo agora.</li>}
            {!failed && !items.length && <li className="catalog-empty">Nenhum item com esse nome. Tente outra palavra ou informe o código.</li>}
            {items.map((item, index) => (
              <li
                key={`${item.kind}-${item.code}`}
                id={`${listId}-option-${index}`}
                role="option"
                aria-selected={index === active}
                className={index === active ? "active" : undefined}
                onMouseDown={(event) => { event.preventDefault(); choose(item); }}
                onMouseEnter={() => setActive(index)}
              >
                <strong>{item.description}</strong>
                <small>{item.kind === "material" ? "CATMAT" : "CATSER"} {item.code}{item.class_name ? ` · ${item.class_name}` : ""}{item.active ? "" : " · inativo"}</small>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="field">
        <label htmlFor={`${listId}-kind`}>Catálogo</label>
        <select id={`${listId}-kind`} name="tipo" value={kind} onChange={(event) => setKind(event.target.value === "servico" ? "servico" : "material")}>
          <option value="material">Material (CATMAT)</option>
          <option value="servico">Serviço (CATSER)</option>
        </select>
      </div>
      <div className="field catalog-code-field">
        <label htmlFor={`${listId}-code`}>Código do item</label>
        <input id={`${listId}-code`} name="codigo" inputMode="numeric" pattern="[0-9]*" maxLength={9} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} placeholder="Preenchido ao escolher" />
      </div>
    </>
  );
}
