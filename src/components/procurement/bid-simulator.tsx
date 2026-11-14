"use client";

import { useState } from "react";
import { BarChart3, LoaderCircle, Target } from "lucide-react";
import type { CompetitionAnalysis } from "@/services/bid-competition";
import type { ProcurementItemView } from "./procurement-items";

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const labels = {
  would_win: "Venceria por preço nesta projeção",
  tie_first: "Empataria na primeira posição",
  would_rank: "Posição projetada por preço",
  insufficient_data: "Dados insuficientes para projetar",
} as const;

export function BidSimulator({ items }: { items: ProcurementItemView[] }) {
  const [itemId, setItemId] = useState(items[0]?.id ?? "");
  const selected = items.find((item) => item.id === itemId) ?? null;
  const [productDescription, setProductDescription] = useState(selected?.description ?? "");
  const [offeredUnitValue, setOfferedUnitValue] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<CompetitionAnalysis | null>(null);

  function selectItem(nextItemId: string) {
    const next = items.find((item) => item.id === nextItemId);
    setItemId(nextItemId);
    setProductDescription(next?.description ?? "");
    setAnalysis(null);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true); setError(null); setAnalysis(null);
    try {
      const response = await fetch("/api/bid-simulations", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ procurementItemId: itemId, productDescription, offeredUnitValue: Number(offeredUnitValue) }),
      });
      const payload = await response.json() as { data?: CompetitionAnalysis; message?: string };
      if (!response.ok || !payload.data) throw new Error(payload.message ?? "Não foi possível concluir a simulação.");
      setAnalysis(payload.data);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Não foi possível concluir a simulação.");
    } finally { setPending(false); }
  }

  if (!items.length) return null;
  return <section className="panel bid-simulator">
    <div className="panel-head"><div><p className="panel-title">Simular competitividade</p><small>Compare seu preço com lances completos, quando disponíveis, ou vencedores históricos compatíveis.</small></div><Target aria-hidden="true" /></div>
    <form onSubmit={submit} className="bid-simulator-form">
      <label>Item<select value={itemId} onChange={(event) => selectItem(event.target.value)}>{items.map((item) => <option value={item.id} key={item.id}>Item {item.itemNumber} — {item.description}</option>)}</select></label>
      <label>Produto que sua empresa ofertará<input value={productDescription} onChange={(event) => setProductDescription(event.target.value)} minLength={2} maxLength={300} required /></label>
      <label>Seu preço unitário (R$)<input value={offeredUnitValue} onChange={(event) => setOfferedUnitValue(event.target.value)} type="number" min="0.0001" step="0.0001" inputMode="decimal" required /></label>
      <button className="button primary" disabled={pending}>{pending ? <LoaderCircle className="spin" aria-hidden="true" /> : <BarChart3 aria-hidden="true" />}{pending ? "Calculando…" : "Simular posição"}</button>
    </form>
    {error && <p className="field-error" role="alert">{error}</p>}
    {analysis && <div className="bid-simulation-result" role="status">
      <strong>{labels[analysis.outcome]}</strong>
      <p>{analysis.isEstimate ? "Estimativa baseada em resultados vencedores históricos; não garante habilitação, desempate ou adjudicação." : "Ranking calculado com a carga completa de lances oficiais disponível para o item."}</p>
      <dl><div><dt>Posição</dt><dd>{analysis.projectedRank ? `${analysis.projectedRank}º` : "Não calculada"}</dd></div><div><dt>Melhor preço</dt><dd>{analysis.minimumPrice === null ? "Não disponível" : currency.format(analysis.minimumPrice)}</dd></div><div><dt>Seu diferencial</dt><dd>{analysis.differenceToBest === null ? "Não disponível" : currency.format(analysis.differenceToBest)}</dd></div><div><dt>Referências</dt><dd>{analysis.referenceCount}</dd></div><div><dt>Confiança</dt><dd>{analysis.confidence === "confirmed" ? "Confirmada" : analysis.confidence === "high" ? "Alta" : analysis.confidence === "medium" ? "Média" : analysis.confidence === "low" ? "Baixa" : "Insuficiente"}</dd></div></dl>
      {analysis.evidence.length > 0 && <details><summary>Ver evidências usadas ({analysis.evidence.length})</summary><ul>{analysis.evidence.map((reference) => <li key={reference.id}>{reference.procurementNumber ?? "Processo sem número"} · {currency.format(reference.unitValue)}{reference.supplierName ? ` · ${reference.supplierName}` : ""}</li>)}</ul></details>}
    </div>}
  </section>;
}
