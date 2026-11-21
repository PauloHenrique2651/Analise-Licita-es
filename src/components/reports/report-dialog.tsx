"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { CircleCheck, Download, ExternalLink, FileDown, LoaderCircle, MapPinned, Search, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { RIBEIRAO_PRETO_REGION } from "@/lib/report/regional-report";

type City = { ibge: string; name: string; uf: string };
type Ready = { url: string; filename: string };
const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];
const KINDS = [{ value: "", label: "Ambos" }, { value: "material", label: "Só produtos" }, { value: "servico", label: "Só serviços" }] as const;
const plain = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const isoDay = (date: Date) => date.toISOString().slice(0, 10);

/** Botão que abre a janela de filtros do relatório gerencial; ao confirmar, gera o PDF e oferece o download. */
export function ReportDialog({ label = "Gerar relatório em PDF", variant = "primary", defaultUf }: { label?: string; variant?: "primary" | "secondary"; defaultUf?: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [ufs, setUfs] = useState<string[]>([defaultUf ?? "SP"]);
  const [cities, setCities] = useState<City[]>([]);
  const [selected, setSelected] = useState<City[]>([]);
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [kind, setKind] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState<Ready | null>(null);

  function show() {
    const end = new Date();
    if (!from) { setFrom(isoDay(new Date(end.getTime() - 365 * 86_400_000))); setTo(isoDay(end)); }
    setError(null); setReady(null); setOpen(true);
  }
  function close() { if (ready) URL.revokeObjectURL(ready.url); setReady(null); setOpen(false); }
  const preset = (days: number | "year") => {
    const end = new Date();
    setTo(isoDay(end));
    setFrom(days === "year" ? `${end.getFullYear()}-01-01` : isoDay(new Date(end.getTime() - days * 86_400_000)));
  };

  // Municípios de todos os estados escolhidos (a região pode atravessar a divisa)
  useEffect(() => {
    if (!open || ufs.length === 0) return;
    let active = true;
    void createClient().from("cities").select("ibge_code,name,state_code").in("state_code", ufs).order("name").limit(4000)
      .then(({ data }) => { if (active) setCities((data ?? []).map((row) => ({ ibge: String(row.ibge_code), name: row.name as string, uf: String(row.state_code) }))); });
    return () => { active = false; };
  }, [open, ufs]);

  const chosen = useMemo(() => new Set(selected.map((city) => city.ibge)), [selected]);
  const visible = useMemo(() => {
    const term = plain(search.trim());
    return cities.filter((city) => ufs.includes(city.uf) && (!term || plain(city.name).includes(term))).slice(0, 150);
  }, [cities, ufs, search]);

  function toggleUf(code: string) {
    setUfs((current) => {
      const next = current.includes(code) ? current.filter((item) => item !== code) : [...current, code];
      setSelected((picked) => picked.filter((city) => next.includes(city.uf))); // tirar o estado tira os municípios dele
      return next;
    });
  }
  const toggle = (city: City) => setSelected((current) => current.some((item) => item.ibge === city.ibge) ? current.filter((item) => item.ibge !== city.ibge) : [...current, city]);

  /** Atalho da região: acrescenta SP à lista de estados e marca os municípios da sugestão (sem apagar o que já foi escolhido). */
  async function applyRibeirao() {
    setName("Macrorregião de Ribeirão Preto"); setSearch("");
    setUfs((current) => current.includes("SP") ? current : [...current, "SP"]);
    const { data } = await createClient().from("cities").select("ibge_code,name,state_code").eq("state_code", "SP").order("name").limit(1000);
    const wanted = new Set<string>(RIBEIRAO_PRETO_REGION.map(plain));
    const picks = (data ?? []).filter((row) => wanted.has(plain(row.name as string))).map((row) => ({ ibge: String(row.ibge_code), name: row.name as string, uf: "SP" }));
    setSelected((current) => [...current, ...picks.filter((city) => !current.some((item) => item.ibge === city.ibge))]);
  }

  async function generate(event: React.FormEvent) {
    event.preventDefault();
    if (selected.length === 0) { setError("Escolha ao menos um município."); return; }
    if (!from || !to || from > to) { setError("Informe um período válido."); return; }
    setLoading(true); setError(null); setReady(null);
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
      const filename = response.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "relatorio-gerencial.pdf";
      const url = URL.createObjectURL(blob);
      setReady({ url, filename });
      // Tenta baixar sozinho; se o navegador bloquear (acontece depois de uma espera), o botão "Baixar PDF" abaixo faz o download com um clique
      const link = document.createElement("a");
      link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Não foi possível gerar o relatório agora."); } finally { setLoading(false); }
  }

  const dialog = <div className="report-layer" role="presentation">
    <button className="report-scrim" aria-label="Fechar" tabIndex={-1} onClick={() => !loading && close()} />
    <form className="report-dialog" role="dialog" aria-modal="true" aria-labelledby="report-title" onSubmit={generate}>
      <header><div><p className="eyebrow">RELATÓRIO GERENCIAL</p><h2 id="report-title">O que entra no relatório</h2></div><button type="button" className="icon-button" aria-label="Fechar" onClick={close} disabled={loading}><X aria-hidden="true" /></button></header>

      <div className="report-body">
        <p className="muted">O PDF responde: o quê, quando, quanto, onde e de que forma as licitações acontecem nos municípios escolhidos, com gráficos e considerações.</p>

        <label className="field">Nome da região (aparece na capa)<input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="Ex.: Macrorregião de Ribeirão Preto" /></label>

        <div className="field">
          <span className="report-label">Estados <strong>({ufs.length} {ufs.length === 1 ? "escolhido" : "escolhidos"})</strong></span>
          <div className="report-ufs" role="group" aria-label="Estados">
            {UFS.map((code) => <button type="button" key={code} className={ufs.includes(code) ? "on" : ""} aria-pressed={ufs.includes(code)} onClick={() => toggleUf(code)}>{code}</button>)}
          </div>
          <small className="muted">Marque mais de um estado se a região atravessa a divisa (municípios de fronteira).</small>
        </div>

        <button type="button" className="button secondary report-preset" onClick={() => void applyRibeirao()}><MapPinned aria-hidden="true" />Incluir os municípios da região de Ribeirão Preto</button>

        <div className="field">
          <label className="report-label" htmlFor="report-search">Municípios <strong>({selected.length} escolhidos)</strong></label>
          <div className="report-search"><Search aria-hidden="true" /><input id="report-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={ufs.length ? "Buscar município" : "Escolha um estado acima"} autoComplete="off" disabled={ufs.length === 0} /></div>
          <ul className="report-cities" aria-label="Municípios dos estados escolhidos">
            {visible.map((city) => <li key={city.ibge}><label><input type="checkbox" checked={chosen.has(city.ibge)} onChange={() => toggle(city)} />{city.name}{ufs.length > 1 && <em>{city.uf}</em>}</label></li>)}
            {visible.length === 0 && <li className="muted">{ufs.length === 0 ? "Escolha ao menos um estado." : cities.length === 0 ? "Carregando municípios…" : "Nenhum município encontrado."}</li>}
          </ul>
          {selected.length > 0 && <div className="report-chosen">{selected.map((city) => <span className="term-chip" key={city.ibge}>{city.name}/{city.uf}<button type="button" aria-label={`Remover ${city.name}`} onClick={() => toggle(city)}><X aria-hidden="true" /></button></span>)}<button type="button" className="text-button" onClick={() => setSelected([])}>Limpar</button></div>}
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

        <div className="field">
          <span className="report-label">O que analisar</span>
          <div className="report-kinds" role="radiogroup" aria-label="Produtos, serviços ou ambos">
            {KINDS.map((item) => <button type="button" role="radio" aria-checked={kind === item.value} key={item.value} className={kind === item.value ? "on" : ""} onClick={() => setKind(item.value)}>{item.label}</button>)}
          </div>
          {kind && <small className="muted">Licitações sem itens coletados são classificadas pelo texto do objeto; o relatório informa quantas.</small>}
        </div>

        {error && <div className="form-error" role="alert">{error}</div>}
        {ready && <div className="report-ready" role="status">
          <CircleCheck aria-hidden="true" />
          <div><strong>Relatório pronto</strong><small>Se o download não começou sozinho, use um dos botões.</small></div>
          <a className="button primary" href={ready.url} download={ready.filename}><Download aria-hidden="true" />Baixar PDF</a>
          <a className="button secondary" href={ready.url} target="_blank" rel="noopener"><ExternalLink aria-hidden="true" />Abrir</a>
        </div>}
      </div>

      <footer>
        <button type="button" className="button secondary" onClick={close} disabled={loading}>{ready ? "Fechar" : "Cancelar"}</button>
        <button className="button primary" disabled={loading}>{loading ? <LoaderCircle className="spin" aria-hidden="true" /> : <FileDown aria-hidden="true" />}{loading ? "Montando o relatório…" : ready ? "Gerar de novo" : "Gerar PDF"}</button>
      </footer>
    </form>
  </div>;

  return <>
    <button type="button" className={`button ${variant}`} onClick={show}><FileDown aria-hidden="true" />{label}</button>
    {open && createPortal(dialog, document.body)}
  </>;
}
