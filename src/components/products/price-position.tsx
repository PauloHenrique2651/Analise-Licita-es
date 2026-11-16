"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ExternalLink, LoaderCircle, Search, Trophy, Users, X } from "lucide-react";

type Found = { id: string; name: string; niche: string; procurements: number; unit: string | null };
type Position = {
  sampleSize: number; lowerCount: number; projectedRank: number; percentile: number | null;
  min: number | null; p25: number | null; median: number | null; p75: number | null; max: number | null;
  bestSupplierId: string | null; bestSupplierName: string | null; differenceToBestPct: number | null; differenceToMedianPct: number | null; unit: string | null;
};
type Result = {
  offered: number; uf: string | null; days: number; position: Position | null;
  clients: { companies: number; simulations: number; min: number | null; median: number | null; max: number | null; lowerCount: number; percentile: number | null } | null;
  winners: Array<{ supplierId: string | null; supplier: string; unitValue: number; wonAt: string | null; state: string | null; city: string | null; procurementId: string; controlNumber: string; officialUrl: string | null }>;
  suppliers: Array<{ supplierId: string; name: string; wins: number; median: number | null; min: number | null; last: number | null; lastWinAt: string | null }>;
};

const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const date = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });

/** "12,50" ou "1.250,90" ou "12.5" -> número */
function parseMoney(text: string) {
  const clean = text.replace(/[^\d.,]/g, "");
  if (!clean) return NaN;
  const normalized = clean.includes(",") ? clean.replace(/\./g, "").replace(",", ".") : clean;
  return Number(normalized);
}

/** Diferença do valor oferecido para uma referência, em linguagem direta. */
function diffText(pct: number | null) {
  if (pct === null) return "";
  if (Math.abs(pct) < 0.5) return "seu valor é igual";
  return `seu valor é ${Math.abs(pct).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% ${pct > 0 ? "maior" : "menor"}`;
}

function verdict(position: Position, offered: number) {
  if (position.sampleSize === 0) return { tone: "neutral", text: "Sem vencedores recentes deste produto neste recorte." };
  if (position.projectedRank === 1) return { tone: "good", text: `Seu valor seria o menor: ficaria em 1º entre ${position.sampleSize} vencedores recentes.` };
  const pct = position.percentile ?? 0;
  if (pct <= 25) return { tone: "good", text: `Valor competitivo: abaixo de ${Math.round(100 - pct)}% dos vencedores recentes.` };
  if (pct <= 60) return { tone: "mid", text: `Valor na média do mercado: ficaria em ${position.projectedRank}º entre ${position.sampleSize} vencedores.` };
  return { tone: "bad", text: `Valor alto: só ${Math.max(0, Math.round(100 - pct))}% dos vencedores foram mais caros que ${money.format(offered)}.` };
}

/** Régua de preços: mínimo, quartis, mediana, máximo e o valor oferecido. */
function Ruler({ position, offered }: { position: Position; offered: number }) {
  const values = [position.min, position.p25, position.median, position.p75, position.max, offered].filter((value): value is number => value !== null);
  const lo = Math.min(...values); const hi = Math.max(...values); const span = hi - lo || 1;
  const at = (value: number) => `${Math.min(100, Math.max(0, ((value - lo) / span) * 100))}%`;
  return <div className="price-ruler" role="img" aria-label={`Seu valor ${money.format(offered)} entre mínimo ${money.format(position.min ?? 0)} e máximo ${money.format(position.max ?? 0)}`}>
    {position.p25 !== null && position.p75 !== null && <i className="range" style={{ left: at(position.p25), width: `calc(${at(position.p75)} - ${at(position.p25)})` }} />}
    {position.median !== null && <i className="median" style={{ left: at(position.median) }}><b>mediana</b></i>}
    <i className="mine" style={{ left: at(offered) }}><b>você</b></i>
    <span className="ruler-min">{money.format(lo)}</span><span className="ruler-max">{money.format(hi)}</span>
  </div>;
}

export function PricePosition({ groupId, groupName, defaultOffered, showSuppliers = true }: { groupId?: string; groupName?: string; defaultOffered?: number; showSuppliers?: boolean }) {
  const [group, setGroup] = useState<{ id: string; name: string } | null>(groupId ? { id: groupId, name: groupName ?? "Produto" } : null);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Found[]>([]);
  const [open, setOpen] = useState(false);
  const [offered, setOffered] = useState(defaultOffered ? String(defaultOffered).replace(".", ",") : "");
  const [uf, setUf] = useState("");
  const [days, setDays] = useState("365");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const request = useRef(0);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (group || query.trim().length < 2) return;
    const id = ++request.current;
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/product-groups/search?q=${encodeURIComponent(query.trim())}`, { cache: "no-store" });
        const payload = await response.json() as { data?: Found[] };
        if (id === request.current) setFound(response.ok ? payload.data ?? [] : []);
      } catch { if (id === request.current) setFound([]); }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query, group]);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (root.current && !root.current.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  async function calculate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!group) return setError("Escolha o produto.");
    const value = parseMoney(offered);
    if (!Number.isFinite(value) || value <= 0) return setError("Informe o valor unitário que você pretende oferecer.");
    setPending(true); setError(null);
    try {
      const params = new URLSearchParams({ offered: String(value), days }); if (uf) params.set("uf", uf);
      const response = await fetch(`/api/product-groups/${group.id}/position?${params}`, { cache: "no-store" });
      const payload = await response.json() as { data?: Result; message?: string };
      if (!response.ok || !payload.data) throw new Error(payload.message ?? "Não foi possível calcular.");
      setResult(payload.data);
    } catch (reason) { setError((reason as Error).message); setResult(null); } finally { setPending(false); }
  }

  const position = result?.position ?? null;
  const call = position && result ? verdict(position, result.offered) : null;

  return <div className="price-position" ref={root}>
    <form onSubmit={calculate} className="price-form">
      {!groupId && <div className="field price-product">
        <label htmlFor="pp-product">Produto</label>
        {group ? <div className="picker-selected"><div><strong>{group.name}</strong></div><button type="button" className="icon-button" aria-label="Trocar produto" onClick={() => { setGroup(null); setQuery(""); setResult(null); }}><X aria-hidden="true" /></button></div>
          : <div className="picker">
            <div className="picker-input input-with-icon"><Search aria-hidden="true" />
              <input id="pp-product" autoComplete="off" placeholder="Ex.: papel sulfite, fralda, cabo elétrico" value={query} onFocus={() => setOpen(true)} onChange={(event) => { setQuery(event.target.value); setOpen(true); }} /></div>
            {open && query.trim().length >= 2 && <div className="picker-list" role="listbox">
              {found.length === 0 ? <p className="picker-caption">Nenhum produto encontrado.</p> : found.map((item) => <button type="button" role="option" aria-selected="false" key={item.id} onClick={() => { setGroup({ id: item.id, name: item.name }); setOpen(false); }}>
                <span><strong>{item.name}</strong><em>{item.niche}</em></span><small>{item.procurements} licitações{item.unit ? ` · ${item.unit}` : ""}</small></button>)}
            </div>}
          </div>}
      </div>}
      <div className="field"><label htmlFor="pp-value">Valor unitário que vou oferecer</label><input id="pp-value" inputMode="decimal" placeholder="R$ 0,00" value={offered} onChange={(event) => setOffered(event.target.value)} /></div>
      <div className="field"><label htmlFor="pp-uf">Estado</label><select id="pp-uf" value={uf} onChange={(event) => setUf(event.target.value)}><option value="">Brasil</option>{UFS.map((code) => <option key={code} value={code}>{code}</option>)}</select></div>
      <div className="field"><label htmlFor="pp-days">Período</label><select id="pp-days" value={days} onChange={(event) => setDays(event.target.value)}><option value="90">90 dias</option><option value="180">180 dias</option><option value="365">12 meses</option><option value="730">24 meses</option></select></div>
      <button className="button primary price-submit" disabled={pending}>{pending ? <LoaderCircle className="spin" aria-hidden="true" /> : <Trophy aria-hidden="true" />}{pending ? "Calculando…" : "Ver minha posição"}</button>
    </form>
    {error && <div className="field-error" role="alert">{error}</div>}

    {result && position && call && <div className="price-result" aria-live="polite">
      <div className={`price-verdict ${call.tone}`}>
        <strong>{position.sampleSize ? `${position.projectedRank}º de ${position.sampleSize + 1}` : "—"}</strong>
        <p>{call.text}</p>
      </div>
      {position.sampleSize > 0 && <>
        <Ruler position={position} offered={result.offered} />
        <dl className="price-facts">
          <div><dt>Menor valor vencedor</dt><dd>{position.min !== null ? money.format(position.min) : "—"}</dd><small>{diffText(position.differenceToBestPct)}</small></div>
          <div><dt>Mediana</dt><dd>{position.median !== null ? money.format(position.median) : "—"}</dd><small>{diffText(position.differenceToMedianPct)}</small></div>
          <div><dt>Faixa central (25% a 75%)</dt><dd>{position.p25 !== null && position.p75 !== null ? `${money.format(position.p25)} – ${money.format(position.p75)}` : "—"}</dd></div>
          <div><dt>Base</dt><dd>{position.sampleSize} vencedores</dd><small>{position.unit ? `por ${position.unit}` : ""} · {result.days === 365 ? "12 meses" : `${result.days} dias`}{result.uf ? ` · ${result.uf}` : " · Brasil"}</small></div>
        </dl>
      </>}

      <div className="price-columns">
        {showSuppliers && <section aria-label="Quem vence neste produto">
          <h3>Quem vence neste produto</h3>
          {result.suppliers.length === 0 ? <p className="muted">Sem concorrentes com vitória registrada neste recorte.</p> : <ol className="price-suppliers">{result.suppliers.map((supplier) => <li key={supplier.supplierId}>
            <Link href={`/app/concorrentes/${supplier.supplierId}`}><strong>{supplier.name}</strong></Link>
            <span>{supplier.wins} vitória{supplier.wins === 1 ? "" : "s"}{supplier.median !== null ? ` · mediana ${money.format(supplier.median)}` : ""}{supplier.min !== null ? ` · menor ${money.format(supplier.min)}` : ""}</span></li>)}</ol>}
        </section>}
        <section aria-label="Últimos valores vencedores">
          <h3>Últimos valores vencedores</h3>
          {result.winners.length === 0 ? <p className="muted">Nenhum resultado homologado neste recorte.</p> : <ol className="price-winners">{result.winners.map((winner, index) => <li key={`${winner.procurementId}-${index}`}>
            <strong>{money.format(winner.unitValue)}</strong>
            <span>{winner.supplierId ? <Link href={`/app/concorrentes/${winner.supplierId}`}>{winner.supplier}</Link> : winner.supplier}{winner.state ? ` · ${winner.city ? `${winner.city}/` : ""}${winner.state}` : ""}{winner.wonAt ? ` · ${date.format(new Date(winner.wonAt))}` : ""}</span>
            <span className="price-links"><Link href={`/app/licitacoes/${winner.procurementId}`}>Licitação</Link>{winner.officialUrl && <a href={winner.officialUrl} target="_blank" rel="noopener noreferrer">Portal oficial<ExternalLink aria-hidden="true" /></a>}</span>
          </li>)}</ol>}
        </section>
      </div>

      <section className="price-clients" aria-label="Comparação com outros clientes do Nexo">
        <h3><Users aria-hidden="true" />Outros clientes do Nexo</h3>
        {result.clients ? <p>{result.clients.companies} outras empresas simularam {result.clients.simulations} valores para este produto: mediana <strong>{result.clients.median !== null ? money.format(result.clients.median) : "—"}</strong>{result.clients.min !== null && result.clients.max !== null ? ` (de ${money.format(result.clients.min)} a ${money.format(result.clients.max)})` : ""}. Seu valor ficaria abaixo de {Math.round(100 - (result.clients.percentile ?? 0))}% deles.</p>
          : <p className="muted">Ainda não há simulações suficientes de outras empresas para comparar. A comparação aparece quando pelo menos 3 outras empresas simulam este produto, e só mostra números agregados: nenhuma empresa é identificada.</p>}
      </section>
    </div>}
  </div>;
}
