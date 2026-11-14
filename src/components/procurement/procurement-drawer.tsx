"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ExternalLink, FileText, Gavel, LoaderCircle, Maximize2, Plus, Search, X } from "lucide-react";
import type { ProcurementSummary } from "@/app/api/procurements/[id]/summary/route";
import { createClient } from "@/lib/supabase/client";
import { DETAIL_PARAM } from "./detail-link";

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const number = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
const dateTime = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

function when(value: string | null) {
  return value ? dateTime.format(new Date(value)) : "Não informado";
}

function countdown(value: string | null) {
  if (!value) return null;
  const hours = (new Date(value).getTime() - Date.now()) / 3_600_000;
  if (hours <= 0) return "prazo encerrado";
  if (hours < 24) return `encerra em ${Math.max(1, Math.floor(hours))} h`;
  return `encerra em ${Math.floor(hours / 24)} dias`;
}

const ME_EPP_LABEL: Record<string, string> = { exclusiva: "Exclusiva ME/EPP", parcial: "Cota ME/EPP", sem: "Ampla concorrência" };
const KIND_LABEL: Record<string, string> = { material: "Material", servico: "Serviço", misto: "Material e serviço" };

type LoadState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: ProcurementSummary };

export function ProcurementDrawer() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const id = searchParams.get(DETAIL_PARAM);
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [itemQuery, setItemQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [addedId, setAddedId] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  function close() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete(DETAIL_PARAM);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    returnFocus.current = document.activeElement as HTMLElement | null;
    fetch(`/api/procurements/${id}/summary`, { signal: controller.signal, credentials: "same-origin" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.message ?? "Não foi possível abrir a licitação.");
        setState({ status: "ready", data: body as ProcurementSummary });
        setAddedId((body as ProcurementSummary).opportunityId);
      })
      .catch((error: Error) => { if (error.name !== "AbortError") setState({ status: "error", message: error.message }); });
    return () => {
      controller.abort();
      setState({ status: "loading" });
      setItemQuery("");
      setAddError(null);
    };
  }, [id]);

  useEffect(() => {
    if (!id) return;
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    const focusTarget = returnFocus.current;
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
      focusTarget?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fecha com o estado de URL atual a cada abertura
  }, [id]);

  const items = useMemo(() => {
    if (state.status !== "ready") return [];
    const term = itemQuery.trim().toLocaleLowerCase("pt-BR");
    return term ? state.data.items.filter((item) => `${item.item_number} ${item.original_description} ${item.catalog_item_code ?? ""}`.toLocaleLowerCase("pt-BR").includes(term)) : state.data.items;
  }, [state, itemQuery]);

  async function addToOpportunities(data: ProcurementSummary) {
    setAdding(true);
    setAddError(null);
    try {
      const title = `${data.control_number ?? "Licitação"} · ${(data.object_description ?? "").slice(0, 140)}`;
      const { data: created, error } = await createClient().from("opportunities").insert({ procurement_id: data.id, title, stage: "identified", statistical_indicator: true }).select("id").single();
      if (error || !created) throw error ?? new Error();
      setAddedId(created.id);
    } catch {
      setAddError("Não foi possível adicionar. Verifique sua permissão e tente de novo.");
    } finally {
      setAdding(false);
    }
  }

  if (!id) return null;

  return (
    <div className="drawer-layer procurement-drawer-layer">
      <button className="drawer-scrim" aria-label="Fechar detalhes da licitação" onClick={close} tabIndex={-1} />
      <aside className="procurement-drawer" role="dialog" aria-modal="true" aria-labelledby="procurement-drawer-title">
        <header className="pd-head">
          <div className="pd-head-meta">
            <span className="badge">{state.status === "ready" ? state.data.source_portal_name ?? "Fonte oficial" : "Carregando"}</span>
            {state.status === "ready" && state.data.control_number && <span className="pd-control">{state.data.control_number}</span>}
          </div>
          <div className="pd-head-actions">
            <Link className="icon-button" href={`/app/licitacoes/${id}`} aria-label="Abrir página completa" title="Abrir página completa"><Maximize2 aria-hidden="true" /></Link>
            <button ref={closeRef} className="icon-button" type="button" onClick={close} aria-label="Fechar"><X aria-hidden="true" /></button>
          </div>
        </header>

        {state.status === "loading" && <div className="pd-loading" aria-live="polite"><LoaderCircle className="spin" aria-hidden="true" />Carregando licitação…</div>}
        {state.status === "error" && <div className="pd-body"><div className="form-error" role="alert">{state.message}</div></div>}

        {state.status === "ready" && (() => {
          const data = state.data;
          const left = countdown(data.proposal_end_at);
          return (
            <div className="pd-body">
              <p className="pd-modality">{[data.modality_name, data.status_name].filter(Boolean).join(" · ")}</p>
              <h2 id="procurement-drawer-title">{data.agency_name ?? "Órgão não informado"}</h2>
              <p className="pd-place">{[data.unit_name, data.city_name && data.state_code ? `${data.city_name}/${data.state_code}` : data.state_code].filter(Boolean).join(" · ")}</p>
              <p className="pd-object">{data.object_description ?? "Objeto não informado."}</p>

              <div className="today-badges">
                {data.dispute_mode && data.dispute_mode !== "Não se aplica" && <span className="badge">{/^dispensa/i.test(data.dispute_mode) ? data.dispute_mode : `Disputa ${data.dispute_mode.toLowerCase()}`}</span>}
                {data.me_epp_benefit && <span className={data.me_epp_benefit === "sem" ? "badge" : "badge badge-accent"}>{ME_EPP_LABEL[data.me_epp_benefit] ?? data.me_epp_benefit}</span>}
                {data.item_kind && <span className="badge">{KIND_LABEL[data.item_kind] ?? data.item_kind}</span>}
              </div>

              <dl className="pd-facts">
                <div><dt>Valor estimado</dt><dd>{Number(data.estimated_value) > 0 ? currency.format(Number(data.estimated_value)) : "Não informado"}</dd></div>
                <div><dt>Propostas até</dt><dd>{when(data.proposal_end_at)}{left && <small className={left === "prazo encerrado" ? "" : "pd-countdown"}>{left}</small>}</dd></div>
                <div><dt>Abertura</dt><dd>{when(data.opening_at)}</dd></div>
                <div><dt>Publicação</dt><dd>{when(data.published_at)}</dd></div>
              </dl>

              <div className="pd-actions">
                {data.source_url && <a className="button primary" href={data.source_url} target="_blank" rel="noopener noreferrer">Abrir no portal<ExternalLink aria-hidden="true" /></a>}
                {data.edital_url && <a className="button" href={data.edital_url} target="_blank" rel="noopener noreferrer"><FileText aria-hidden="true" />Edital</a>}
                {addedId
                  ? <Link className="button" href="/app/oportunidades"><Check aria-hidden="true" />Nas minhas oportunidades</Link>
                  : <button className="button" type="button" onClick={() => void addToOpportunities(data)} disabled={adding}>{adding ? <LoaderCircle className="spin" aria-hidden="true" /> : <Plus aria-hidden="true" />}Acompanhar</button>}
              </div>
              {addError && <div className="form-error" role="alert">{addError}</div>}

              <section className="pd-items" aria-labelledby="pd-items-title">
                <div className="pd-items-head">
                  <h3 id="pd-items-title">Itens <small>{data.items.length}</small></h3>
                  {data.items.length > 5 && (
                    <label className="pd-item-search"><Search aria-hidden="true" /><span className="sr-only">Buscar nos itens</span><input type="search" value={itemQuery} onChange={(event) => setItemQuery(event.target.value)} placeholder="Buscar nos itens" /></label>
                  )}
                </div>
                {data.items.length === 0 ? <p className="pd-empty">Os itens ainda não foram sincronizados. Abra no portal para ver a lista oficial.</p>
                  : items.length === 0 ? <p className="pd-empty">Nenhum item com esse termo.</p> : (
                  <ol>
                    {items.map((item) => (
                      <li key={item.id}>
                        <div className="pd-item-main">
                          <span className="pd-item-number">{item.item_number}</span>
                          <div>
                            <p>{item.original_description}</p>
                            <small>{[item.quantity !== null ? `${number.format(Number(item.quantity))} ${item.unit ?? ""}`.trim() : null, item.catalog_item_code ? `Catálogo ${item.catalog_item_code}` : null, item.benefit_type && item.benefit_type !== "Não se aplica" ? item.benefit_type : null].filter(Boolean).join(" · ")}</small>
                          </div>
                        </div>
                        <div className="pd-item-side">
                          <strong>{item.estimated_unit_value !== null ? currency.format(Number(item.estimated_unit_value)) : "—"}</strong>
                          <small>unitário estimado</small>
                          <Link className="text-button" href={`/app/disputa?item=${item.id}`}><Gavel aria-hidden="true" />Preparar disputa</Link>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </div>
          );
        })()}
      </aside>
    </div>
  );
}
