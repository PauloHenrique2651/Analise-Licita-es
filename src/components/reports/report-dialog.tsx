"use client";

import { useEffect, useMemo, useState } from "react";
import { FileDown, LoaderCircle, MapPinned, Search, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { RIBEIRAO_PRETO_REGION } from "@/lib/report/regional-report";

type City = { ibge: string; name: string };
const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];
const plain = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const isoDay = (date: Date) => date.toISOString().slice(0, 10);

/** Botão que abre a janela de filtros do relatório gerencial; ao confirmar, baixa o PDF. */
export function ReportDialog({ label = "Gerar relatório em PDF", variant = "primary", defaultUf }: { label?: string; variant?: "primary" | "secondary"; defaultUf?: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [uf, setUf] = useState(defaultUf ?? "SP");
  const [stateCities, setStateCities] = useState<City[]>([]);
  const [selected, setSelected] = useState<City[]>([]);
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [kind, setKind] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function show() {
    const end = new Date();
    if (!from) { setFrom(isoDay(new Date(end.getTime() - 365 * 86_400_000))); setTo(isoDay(end)); }
    setError(null); setOpen(true);
  }
  const preset = (days: number | "year") => {
    const end = new Date();
    setTo(isoDay(end));
    setFrom(days === "year" ? `${end.getFullYear()}-01-01` : isoDay(new Date(end.getTime() - days * 86_400_000)));
  };

  useEffect(() => {
    if (!open) return;
    let active = true;
    void createClient().from("cities").select("ibge_code,name").eq("state_code", uf).order("name").limit(1000)
      .then(({ data }) => { if (active) setStateCities((data ?? []).map((row) => ({ ibge: String(row.ibge_code), name: row.name }))); });
    return () => { active = false; };
  }, [open, uf]);

  const chosen = useMemo(() => new Set(selected.map((city) => city.ibge)), [selected]);
  const visible = useMemo(() => {
    const term = plain(search.trim());
    return stateCities.filter((city) => !term || plain(city.name).includes(term)).slice(0, 80);
  }, [stateCities, search]);

  function chooseUf(value: string) { setUf(value); setStateCities([]); setSelected([]); setSearch(""); }
  /** Atalho da região: carrega os municípios de SP e já marca os da sugestão. */
  async function applyRibeirao() {
    setName("Macrorregião de Ribeirão Preto"); setUf("SP"); setSearch("");
    const { data } = await createClient().from("cities").select("ibge_code,name").eq("state_code", "SP").order("name").limit(1000);
    const list = (data ?? []).map((row) => ({ ibge: String(row.ibge_code), name: row.name as string }));
    const wanted = new Set<string>(RIBEIRAO_PRETO_REGION.map(plain));
    setStateCities(list);
    setSelected(list.filter((city) => wanted.has(plain(city.name))));
  }
  const toggle = (city: City) => setSelected((current) => current.some((item) => item.ibge === city.ibge) ? current.filter((item) => item.ibge !== city.ibge) : [...current, city]);

  async function generate(event: React.FormEvent) {
    event.preventDefault();
    if (selected.length === 0) { setError("Escolha ao menos um município."); return; }
    if (!from || !to || from > to) { setError("Informe um período válido."); return; }
    setLoading(true); setError(null);
    try {
      const query = new URLSearchParams({ cities: selected.map((city) => city.ibge).join(","), from, to });
      if (kind) query.set("kind", kind);
      if (name.trim().length >= 2) query.set("name", name.trim());
      const response = await fetch(`/api/reports/regional?${query}`, { signal: AbortSignal.timeout(110_000) });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message ?? "Não foi possível gerar o relatório agora.");
      }
      const blob = await response.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = response.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "relatorio-gerencial.pdf";
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
      setOpen(false);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Não foi possível gerar o relatório agora."); } finally { setLoading(false); }
  }

  return <>
    <button type="button" className={`button ${variant}`} onClick={show}><FileDown aria-hidden="true" />{label}</button>
    {open && <div className="drawer-layer report-layer" role="presentation">
      <button className="drawer-scrim" aria-label="Fechar" tabIndex={-1} onClick={() => !loading && setOpen(false)} />
      <form className="report-dialog" role="dialog" aria-modal="true" aria-labelledby="report-title" onSubmit={generate}>
        <header><div><p className="eyebrow">RELATÓRIO GERENCIAL</p><h2 id="report-title">O que entra no relatório</h2></div><button type="button" className="icon-button" aria-label="Fechar" onClick={() => setOpen(false)} disabled={loading}><X aria-hidden="true" /></button></header>
        <p className="muted">O PDF responde: o quê, quando, quanto, onde e de que forma as licitações acontecem nos municípios escolhidos, com gráficos e considerações.</p>

        <div className="report-grid">
          <label className="field">Nome da região (aparece na capa)<input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="Ex.: Macrorregião de Ribeirão Preto" /></label>
          <label className="field">Estado<select value={uf} onChange={(event) => chooseUf(event.target.value)}>{UFS.map((code) => <option key={code} value={code}>{code}</option>)}</select></label>
        </div>
        <button type="button" className="button secondary report-preset" onClick={() => void applyRibeirao()}><MapPinned aria-hidden="true" />Usar a região de Ribeirão Preto</button>
        <small className="muted">É uma sugestão de municípios; confira a lista e ajuste antes de gerar.</small>

        <div className="field">
          <label htmlFor="report-search">Municípios <strong>({selected.length} escolhidos)</strong></label>
          <div className="report-search"><Search aria-hidden="true" /><input id="report-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar município" autoComplete="off" /></div>
          <ul className="report-cities" aria-label="Municípios do estado">
            {visible.map((city) => <li key={city.ibge}><label><input type="checkbox" checked={chosen.has(city.ibge)} onChange={() => toggle(city)} />{city.name}</label></li>)}
            {visible.length === 0 && <li className="muted">{stateCities.length === 0 ? "Carregando municípios…" : "Nenhum município encontrado."}</li>}
          </ul>
          {selected.length > 0 && <div className="report-chosen">{selected.map((city) => <span className="term-chip" key={city.ibge}>{city.name}<button type="button" aria-label={`Remover ${city.name}`} onClick={() => toggle(city)}><X aria-hidden="true" /></button></span>)}<button type="button" className="text-button" onClick={() => setSelected([])}>Limpar</button></div>}
        </div>

        <div className="report-grid">
          <label className="field">De<input type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} /></label>
          <label className="field">Até<input type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} /></label>
        </div>
        <div className="report-presets" aria-label="Períodos rápidos">
          <button type="button" className="text-button" onClick={() => preset(180)}>Últimos 6 meses</button>
          <button type="button" className="text-button" onClick={() => preset(365)}>Últimos 12 meses</button>
          <button type="button" className="text-button" onClick={() => preset("year")}>Este ano</button>
        </div>
        <label className="field">Tipo de contratação<select value={kind} onChange={(event) => setKind(event.target.value)}><option value="">Materiais e serviços</option><option value="material">Só materiais</option><option value="servico">Só serviços</option></select></label>

        {error && <div className="form-error" role="alert">{error}</div>}
        <footer>
          <button type="button" className="button secondary" onClick={() => setOpen(false)} disabled={loading}>Cancelar</button>
          <button className="button primary" disabled={loading}>{loading ? <LoaderCircle className="spin" aria-hidden="true" /> : <FileDown aria-hidden="true" />}{loading ? "Montando o relatório… até 30 s" : "Gerar PDF"}</button>
        </footer>
      </form>
    </div>}
  </>;
}
