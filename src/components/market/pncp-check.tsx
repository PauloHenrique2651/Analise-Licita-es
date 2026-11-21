"use client";

import { useState } from "react";
import { CircleAlert, CircleCheck, LoaderCircle, ShieldCheck } from "lucide-react";

type Row = { code: number; name: string; pncp: number | null; ours: number };
const number = new Intl.NumberFormat("pt-BR");

/** Conferência ao vivo com o PNCP: o total oficial por modalidade, ao lado do nosso, para o dia escolhido. */
export function PncpCheck() {
  // Ontem (horário de Brasília): o dia mais recente que já fechou
  const [defaultDate] = useState(() => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(Date.now() - 86_400_000)));
  const [date, setDate] = useState(defaultDate);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<{ source: string; checkedAt: string | null; partial?: boolean } | null>(null);

  async function run(live: boolean) {
    setLoading(true); setError(null); setRows(null); setInfo(null);
    try {
      const response = await fetch(`/api/pncp-check?date=${date}${live ? "&live=1" : ""}`, { cache: "no-store", signal: AbortSignal.timeout(45_000) });
      if (!response.ok) throw new Error();
      const payload = (await response.json()) as { rows: Row[]; source: string; checkedAt: string | null; partial?: boolean };
      setRows(payload.rows); setInfo({ source: payload.source, checkedAt: payload.checkedAt, partial: payload.partial });
    } catch { setError("Não foi possível conferir agora. O PNCP pode estar limitando as consultas; tente de novo em instantes."); } finally { setLoading(false); }
  }

  const totalPncp = rows?.reduce((sum, row) => sum + (row.pncp ?? 0), 0) ?? 0;
  const totalOurs = rows?.reduce((sum, row) => sum + row.ours, 0) ?? 0;
  const missing = rows ? rows.reduce((sum, row) => sum + Math.max(0, (row.pncp ?? 0) - row.ours), 0) : 0;
  return <section className="panel pncp-check" aria-label="Conferência com o PNCP">
    <div className="panel-head"><div><p className="panel-title">Conferência com o PNCP</p><small>Total oficial do PNCP e o nosso, por modalidade, no dia escolhido. Conferir mostra a última conferência automática; Conferir ao vivo pergunta à API oficial agora.</small></div></div>
    <div className="pncp-check-form">
      <label>Dia de publicação<input type="date" value={date} max={defaultDate} onChange={(event) => setDate(event.target.value)} /></label>
      <button type="button" className="button primary" disabled={loading || !date} onClick={() => void run(false)}>{loading ? <LoaderCircle className="spin" aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}{loading ? "Conferindo…" : "Conferir"}</button>
      <button type="button" className="button secondary" disabled={loading || !date} onClick={() => void run(true)} title="Pergunta ao PNCP agora; pode levar até 25 segundos">Conferir ao vivo no PNCP</button>
    </div>
    {error && <div className="form-error" role="alert">{error}</div>}
    {rows && info && <p className="muted pncp-check-meta">{info.source === "live" ? "Consulta ao vivo à API do PNCP" : "Última conferência automática"}{info.checkedAt ? ` · ${new Date(info.checkedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : ""}{info.partial ? " · o PNCP não respondeu a tempo para todas as modalidades" : ""}</p>}
    {rows && rows.length === 0 && <div className="empty-inline"><span>Sem registros para este dia.</span></div>}
    {rows && rows.length > 0 && <>
      <div className={`pncp-check-result ${missing === 0 ? "ok" : "warn"}`} role="status">
        {missing === 0 ? <CircleCheck aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}
        <span>{missing === 0 ? `Bate com o PNCP: ${number.format(totalOurs)} de ${number.format(totalPncp)} publicações.` : `Temos ${number.format(totalOurs)} de ${number.format(totalPncp)} publicações. Faltam ${number.format(missing)}; a conferência automática busca o que falta.`}</span>
      </div>
      <div className="table-wrap"><table className="compact-table"><thead><tr><th>Modalidade</th><th className="num">PNCP (oficial)</th><th className="num">Nosso sistema</th><th className="num">Diferença</th></tr></thead>
        <tbody>{rows.map((row) => { const diff = (row.pncp ?? 0) - row.ours; return <tr key={row.code}><td>{row.name}</td><td className="num">{row.pncp === null ? "indisponível" : number.format(row.pncp)}</td><td className="num">{number.format(row.ours)}</td><td className={`num ${diff > 0 ? "neg" : ""}`}>{row.pncp === null ? "—" : diff > 0 ? `faltam ${number.format(diff)}` : "ok"}</td></tr>; })}</tbody>
        <tfoot><tr><th>Total</th><th className="num">{number.format(totalPncp)}</th><th className="num">{number.format(totalOurs)}</th><th className="num">{missing ? `faltam ${number.format(missing)}` : "ok"}</th></tr></tfoot></table></div>
    </>}
  </section>;
}
