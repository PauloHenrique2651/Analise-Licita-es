"use client";

import { BellRing, Check, ChevronDown, LoaderCircle, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type City = { ibge: string; name: string };
type AlertFilters = { keywords?: string[]; exclude?: string[]; uf?: string; cities?: City[]; query?: string };
type Alert = { id: string; name: string; alertType: string; filters: AlertFilters; enabled: boolean; createdAt: string };
type Match = { id: string; control_number: string; object_description: string; agency_name: string | null; state_code: string | null; city_name: string | null; published_at: string | null; total_count: number };

const UFS = ["AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO"];
const MAX_TERMS = 30;

/** Palavras-chave de um alerta; alertas antigos guardavam uma só em `query`. */
const keywordsOf = (filters: AlertFilters) => filters.keywords?.length ? filters.keywords : filters.query ? [filters.query] : [];

/** Campo de lista: digite e tecle Enter (ou vírgula) para adicionar; cada item vira uma etiqueta removível. */
function TermsInput({ id, label, hint, placeholder, terms, onChange }: { id: string; label: string; hint: string; placeholder: string; terms: string[]; onChange: (terms: string[]) => void }) {
  const [draft, setDraft] = useState("");
  function commit(value = draft) {
    const next = value.split(",").map((term) => term.trim()).filter((term) => term.length >= 2 && term.length <= 60 && !terms.some((item) => item.toLowerCase() === term.toLowerCase()));
    if (next.length) onChange([...terms, ...next].slice(0, MAX_TERMS));
    setDraft("");
  }
  return <div className="field terms-field">
    <label htmlFor={id}>{label}</label>
    <div className="terms-box">
      {terms.map((term) => <span className="term-chip" key={term}>{term}<button type="button" aria-label={`Remover ${term}`} onClick={() => onChange(terms.filter((item) => item !== term))}><X aria-hidden="true" /></button></span>)}
      <input id={id} value={draft} placeholder={terms.length ? "" : placeholder} maxLength={60}
        onChange={(event) => setDraft(event.target.value)} onBlur={() => commit()}
        onKeyDown={(event) => { if (event.key === "Enter" || event.key === ",") { event.preventDefault(); commit(); } else if (event.key === "Backspace" && !draft && terms.length) onChange(terms.slice(0, -1)); }} />
    </div>
    <small>{hint}</small>
  </div>;
}

function Matches({ alert }: { alert: Alert }) {
  const [rows, setRows] = useState<Match[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
    void createClient().rpc("match_alert_procurements", { p_keywords: keywordsOf(alert.filters), p_exclude: alert.filters.exclude ?? [], p_state: alert.filters.uf ?? null, p_cities: (alert.filters.cities ?? []).map((city) => city.ibge), p_since: since, p_limit: 10, p_offset: 0 })
      .then(({ data, error }) => { if (!active) return; if (error) setFailed(true); else setRows((data ?? []) as Match[]); });
    return () => { active = false; };
  }, [alert]);
  if (failed) return <p className="muted">Não foi possível buscar as licitações deste alerta.</p>;
  if (!rows) return <p className="muted"><LoaderCircle className="spin" aria-hidden="true" /> Buscando…</p>;
  if (rows.length === 0) return <p className="muted">Nenhuma licitação nos últimos 7 dias combina com este alerta.</p>;
  return <div className="alert-matches">
    <p className="muted">{Intl.NumberFormat("pt-BR").format(rows[0].total_count)} {rows[0].total_count === 1 ? "licitação" : "licitações"} nos últimos 7 dias{rows[0].total_count > rows.length ? ` · mostrando as ${rows.length} mais recentes` : ""}</p>
    <ul>{rows.map((row) => <li key={row.id}><Link href={`/app/licitacoes/${row.id}`}><strong>{row.object_description.slice(0, 140)}</strong><span>{[row.agency_name, row.city_name && row.state_code ? `${row.city_name}/${row.state_code}` : null, row.published_at ? new Date(row.published_at).toLocaleDateString("pt-BR") : null].filter(Boolean).join(" · ")}</span></Link></li>)}</ul>
  </div>;
}

export function AlertsWorkspace({ initialAlerts }: { initialAlerts: Alert[] }) {
  const [alerts, setAlerts] = useState(initialAlerts);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [exclude, setExclude] = useState<string[]>([]);
  const [uf, setUf] = useState("");
  const [cities, setCities] = useState<City[]>([]);
  const [stateCities, setStateCities] = useState<City[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    if (!uf) return;
    let active = true;
    void createClient().from("cities").select("ibge_code,name").eq("state_code", uf).order("name").limit(1000)
      .then(({ data }) => { if (active) setStateCities((data ?? []).map((row) => ({ ibge: String(row.ibge_code), name: row.name }))); });
    return () => { active = false; };
  }, [uf]);

  function chooseUf(value: string) { setUf(value); setCities([]); setStateCities([]); }

  async function createAlert(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = String(new FormData(form).get("name") ?? "").trim();
    if (name.length < 3) return;
    if (!keywords.length && !uf) { setError("Informe ao menos uma palavra-chave ou um estado."); return; }
    setPending(true); setError(null);
    try {
      const filters: AlertFilters = { keywords: keywords.length ? keywords : undefined, exclude: exclude.length ? exclude : undefined, uf: uf || undefined, cities: cities.length ? cities : undefined };
      const { data, error: insertError } = await createClient().from("alerts").insert({ name, alert_type: "procurement", filters, enabled: true }).select("id,name,alert_type,filters,enabled,created_at").single();
      if (insertError || !data) throw insertError ?? new Error();
      setAlerts((current) => [{ id: data.id, name: data.name, alertType: data.alert_type, filters: (data.filters ?? {}) as AlertFilters, enabled: data.enabled, createdAt: data.created_at }, ...current]);
      form.reset(); setKeywords([]); setExclude([]); chooseUf("");
    } catch { setError("Não foi possível criar o alerta. Tente novamente."); } finally { setPending(false); }
  }

  async function toggle(id: string, enabled: boolean) {
    setPending(true); setError(null);
    try {
      const { error: updateError } = await createClient().from("alerts").update({ enabled: !enabled }).eq("id", id);
      if (updateError) throw updateError;
      setAlerts((current) => current.map((alert) => alert.id === id ? { ...alert, enabled: !enabled } : alert));
    } catch { setError("Não foi possível atualizar o alerta."); } finally { setPending(false); }
  }

  async function remove(id: string) {
    setPending(true); setError(null);
    try {
      const { error: deleteError } = await createClient().from("alerts").delete().eq("id", id);
      if (deleteError) throw deleteError;
      setAlerts((current) => current.filter((alert) => alert.id !== id));
    } catch { setError("Não foi possível excluir o alerta."); } finally { setPending(false); }
  }

  const available = stateCities.filter((city) => !cities.some((chosen) => chosen.ibge === city.ibge));

  return <>
    <header className="page-header"><div><p className="eyebrow">OPORTUNIDADES</p><h1>Alertas de oportunidades</h1><p>Crie grupos de palavras (ex.: Papelaria) e escolha estado e municípios para acompanhar só o que interessa.</p></div></header>
    {error && <div className="form-error" role="alert">{error}</div>}
    <section className="panel alert-create">
      <div className="panel-head"><div><p className="panel-title">Novo alerta</p><small>O perfil fica salvo para o seu time e será usado nas próximas notificações.</small></div></div>
      <form onSubmit={createAlert}>
        <div className="filter-fields">
          <div className="field"><label htmlFor="alert-name">Nome do grupo</label><input id="alert-name" name="name" minLength={3} maxLength={120} required placeholder="Ex.: Papelaria" /></div>
          <TermsInput id="alert-keywords" label="Palavras-chave" hint="Tecle Enter para adicionar. A licitação precisa ter qualquer uma delas." placeholder="Ex.: papel sulfite, caneta" terms={keywords} onChange={setKeywords} />
          <TermsInput id="alert-exclude" label="Palavras a excluir" hint="Se a licitação tiver qualquer uma destas, ela não aparece." placeholder="Ex.: toner, cartucho" terms={exclude} onChange={setExclude} />
          <div className="field"><label htmlFor="alert-uf">Estado</label><select id="alert-uf" value={uf} onChange={(event) => chooseUf(event.target.value)}><option value="">Todo o Brasil</option>{UFS.map((code) => <option key={code} value={code}>{code}</option>)}</select></div>
          <div className="field"><label htmlFor="alert-city">Municípios</label>
            <select id="alert-city" value="" disabled={!uf} onChange={(event) => { const city = stateCities.find((item) => item.ibge === event.target.value); if (city) setCities((current) => [...current, city]); }}>
              <option value="">{uf ? (cities.length ? "Adicionar outro município" : `Todos os municípios de ${uf}`) : "Escolha um estado primeiro"}</option>
              {available.map((city) => <option key={city.ibge} value={city.ibge}>{city.name}</option>)}
            </select>
            {cities.length > 0 && <div className="terms-box chosen">{cities.map((city) => <span className="term-chip" key={city.ibge}>{city.name}<button type="button" aria-label={`Remover ${city.name}`} onClick={() => setCities((current) => current.filter((item) => item.ibge !== city.ibge))}><X aria-hidden="true" /></button></span>)}</div>}
          </div>
        </div>
        <button className="button primary" disabled={pending}>{pending ? <LoaderCircle className="spin" aria-hidden="true" /> : <Plus aria-hidden="true" />}{pending ? "Salvando…" : "Criar alerta"}</button>
      </form>
    </section>
    <section className="alert-list">
      {alerts.length === 0
        ? <div className="panel empty-inline tall"><BellRing aria-hidden="true" /><span>Nenhum alerta criado. Monte o primeiro grupo para não refazer a mesma busca todos os dias.</span></div>
        : alerts.map((alert) => {
          const words = keywordsOf(alert.filters);
          const cityNames = (alert.filters.cities ?? []).map((city) => city.name);
          return <article className="panel" key={alert.id}>
            <BellRing aria-hidden="true" />
            <div>
              <h2>{alert.name}</h2>
              <p>{words.length ? `Palavras: ${words.join(", ")}` : "Todos os itens"}</p>
              {alert.filters.exclude?.length ? <p>Exclui: {alert.filters.exclude.join(", ")}</p> : null}
              <p>{alert.filters.uf ?? "Brasil"}{cityNames.length ? ` · ${cityNames.join(", ")}` : alert.filters.uf ? " · todos os municípios" : ""}</p>
            </div>
            <button className={alert.enabled ? "button secondary" : "button"} onClick={() => void toggle(alert.id, alert.enabled)} disabled={pending}>{alert.enabled ? <Check aria-hidden="true" /> : null}{alert.enabled ? "Ativo" : "Pausado"}</button>
            <button className="icon-button danger" aria-label={`Excluir ${alert.name}`} onClick={() => void remove(alert.id)} disabled={pending}><Trash2 aria-hidden="true" /></button>
            <button type="button" className="text-button alert-open" aria-expanded={open === alert.id} onClick={() => setOpen(open === alert.id ? null : alert.id)}><ChevronDown aria-hidden="true" />{open === alert.id ? "Ocultar licitações" : "Ver licitações dos últimos 7 dias"}</button>
            {open === alert.id && <div className="alert-matches-wrap"><Matches alert={alert} /></div>}
          </article>;
        })}
    </section>
  </>;
}
