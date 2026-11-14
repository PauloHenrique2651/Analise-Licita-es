"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Check, ClipboardCopy, LoaderCircle, Save, Trash2 } from "lucide-react";
import { saveBidStrategy, type SaveStrategyState } from "@/app/app/disputa/actions";
import { floorPrice, parseMoney, recommendBid, type BidStatus, type BidStrategyNumbers, type DecrementType } from "@/lib/dispute-copilot";
import type { MarketReference, SavedStrategy } from "@/services/dispute-copilot-service";

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const percent = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const plain = (value: number) => value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS_LABEL: Record<BidStatus, string> = {
  abrir: "Primeiro lance",
  cobrir: "Cobrir",
  limite: "No limite",
  parar: "Parar",
  lider: "Você lidera",
};

interface LogEntry { at: string; best: number; mine: number | null; status: BidStatus; recommended: number | null }

export function DisputeCopilot({ itemId, strategy, estimatedUnitValue, references, disputeMode }: {
  itemId: string;
  strategy: SavedStrategy | null;
  estimatedUnitValue: number | null;
  references: MarketReference[];
  disputeMode: string | null;
}) {
  const [state, formAction, saving] = useActionState<SaveStrategyState, FormData>(saveBidStrategy, { status: "idle", message: null });
  const [cost, setCost] = useState(strategy ? plain(strategy.unitCost) : "");
  const [marginPct, setMarginPct] = useState(strategy ? plain(strategy.minMarginPct) : "10,00");
  const [opening, setOpening] = useState(strategy?.openingBid ? plain(strategy.openingBid) : "");
  const [decrement, setDecrement] = useState(strategy ? plain(strategy.minDecrement) : "0,01");
  const [decrementType, setDecrementType] = useState<DecrementType>(strategy?.decrementType ?? "valor");
  const [best, setBest] = useState("");
  const [mine, setMine] = useState("");
  const [copied, setCopied] = useState(false);
  const storageKey = `nexo-dispute-log-${itemId}`;
  const [log, setLog] = useState<LogEntry[]>([]);
  const bestRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(storageKey);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- histórico local restaurado uma única vez ao abrir a tela
      if (saved) setLog(JSON.parse(saved) as LogEntry[]);
    } catch { /* histórico local é opcional */ }
  }, [storageKey]);

  const numbers: BidStrategyNumbers | null = useMemo(() => {
    const unitCost = parseMoney(cost);
    const margin = parseMoney(marginPct);
    const step = parseMoney(decrement);
    if (unitCost === null || margin === null || step === null || step <= 0) return null;
    return { unitCost, minMarginPct: margin, minDecrement: step, decrementType, openingBid: parseMoney(opening) };
  }, [cost, marginPct, decrement, decrementType, opening]);

  const bestValue = parseMoney(best);
  const mineValue = parseMoney(mine);
  const recommendation = numbers ? recommendBid(numbers, bestValue && bestValue > 0 ? bestValue : null, mineValue && mineValue > 0 ? mineValue : null) : null;
  const floor = numbers ? floorPrice(numbers) : null;
  const reference = references[0] ?? null;

  function persist(next: LogEntry[]) {
    setLog(next);
    try { window.sessionStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* opcional */ }
  }

  function register(event: React.FormEvent) {
    event.preventDefault();
    if (!recommendation || bestValue === null || bestValue <= 0) return;
    persist([{ at: new Date().toISOString(), best: bestValue, mine: mineValue, status: recommendation.status, recommended: recommendation.recommended }, ...log].slice(0, 200));
    bestRef.current?.select();
  }

  async function copyRecommended() {
    if (!recommendation?.recommended) return;
    try {
      await navigator.clipboard.writeText(plain(recommendation.recommended));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch { /* área de transferência indisponível */ }
  }

  return (
    <div className="copilot-layout">
      <section className="panel copilot-strategy">
        <div className="panel-head"><div><p className="panel-title">Sua estratégia</p><small>Defina antes da sessão. O piso é o menor valor que você aceita.</small></div></div>
        <form action={formAction} className="copilot-form">
          <input type="hidden" name="itemId" value={itemId} />
          <div className="field"><label htmlFor="cp-cost">Custo unitário (R$)</label><input id="cp-cost" name="unitCost" inputMode="decimal" required value={cost} onChange={(e) => setCost(e.target.value)} placeholder="Ex.: 18,40" /></div>
          <div className="field"><label htmlFor="cp-margin">Margem mínima (%)</label><input id="cp-margin" name="minMarginPct" inputMode="decimal" required value={marginPct} onChange={(e) => setMarginPct(e.target.value)} /></div>
          <div className="copilot-floor" aria-live="polite">
            <span>Seu piso</span>
            <strong>{floor !== null ? currency.format(floor) : "—"}</strong>
            {estimatedUnitValue ? <small>Estimado no edital: {currency.format(estimatedUnitValue)}{floor !== null && floor > estimatedUnitValue ? " · seu piso está acima do estimado" : ""}</small> : <small>Sem valor estimado no edital.</small>}
          </div>
          <div className="field"><label htmlFor="cp-opening">Primeiro lance (opcional)</label><input id="cp-opening" name="openingBid" inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="Deixe vazio para usar o piso" /></div>
          <div className="field copilot-step">
            <label htmlFor="cp-step">Intervalo mínimo entre lances</label>
            <div>
              <input id="cp-step" name="minDecrement" inputMode="decimal" required value={decrement} onChange={(e) => setDecrement(e.target.value)} />
              <select name="decrementType" aria-label="Tipo de intervalo" value={decrementType} onChange={(e) => setDecrementType(e.target.value === "percentual" ? "percentual" : "valor")}>
                <option value="valor">R$</option>
                <option value="percentual">%</option>
              </select>
            </div>
            <small>Use o intervalo definido no edital.</small>
          </div>
          <div className="field"><label htmlFor="cp-notes">Observações</label><textarea id="cp-notes" name="notes" rows={3} maxLength={2000} defaultValue={strategy?.notes ?? ""} placeholder="Ex.: prazo de entrega apertado, frete incluso" /></div>
          {state.message && <div className={state.status === "saved" ? "form-success" : "form-error"} role="status">{state.status === "saved" && <Check aria-hidden="true" />}{state.message}</div>}
          <button className="button" type="submit" disabled={saving}>{saving ? <LoaderCircle className="spin" aria-hidden="true" /> : <Save aria-hidden="true" />}{saving ? "Salvando…" : "Salvar estratégia"}</button>
        </form>
      </section>

      <section className="panel copilot-live">
        <div className="panel-head"><div><p className="panel-title">Durante a disputa</p><small>Digite o melhor lance que aparece no portal. O Nexo calcula o seu próximo lance.</small></div></div>
        <form className="copilot-inputs" onSubmit={register}>
          <div className="field"><label htmlFor="cp-best">Melhor lance no portal (R$)</label><input ref={bestRef} id="cp-best" inputMode="decimal" value={best} onChange={(e) => setBest(e.target.value)} placeholder="Ex.: 21,90" autoComplete="off" /></div>
          <div className="field"><label htmlFor="cp-mine">Seu último lance (opcional)</label><input id="cp-mine" inputMode="decimal" value={mine} onChange={(e) => setMine(e.target.value)} placeholder="Se já deu lance" autoComplete="off" /></div>
          <button className="button" type="submit" disabled={!recommendation || bestValue === null}>Registrar no histórico</button>
        </form>

        {!numbers ? (
          <div className="empty-inline">Preencha custo, margem e intervalo para ver a recomendação.</div>
        ) : recommendation && (
          <div className={`copilot-result status-${recommendation.status}`} aria-live="polite">
            <span className="copilot-status">{STATUS_LABEL[recommendation.status]}</span>
            <div className="copilot-value">
              {recommendation.recommended !== null ? (
                <>
                  <strong>{currency.format(recommendation.recommended)}</strong>
                  <button type="button" className="button" onClick={() => void copyRecommended()}>{copied ? <Check aria-hidden="true" /> : <ClipboardCopy aria-hidden="true" />}{copied ? "Copiado" : "Copiar valor"}</button>
                </>
              ) : <strong className="copilot-hold">Não dê lance</strong>}
            </div>
            <p>{recommendation.message}</p>
            <dl>
              <div><dt>Margem neste valor</dt><dd>{recommendation.marginPct !== null ? `${percent.format(recommendation.marginPct)}%` : "—"}</dd></div>
              <div><dt>Acima do piso</dt><dd>{recommendation.aboveFloor !== null ? currency.format(recommendation.aboveFloor) : "—"}</dd></div>
              <div><dt>Intervalo aplicado</dt><dd>{currency.format(recommendation.step)}</dd></div>
              <div><dt>Mediana de mercado</dt><dd>{reference ? `${currency.format(reference.median)}${reference.unit ? ` / ${reference.unit}` : ""}` : "—"}</dd></div>
            </dl>
          </div>
        )}

        {disputeMode && /fechado/i.test(disputeMode) && (
          <p className="copilot-tip">Disputa {disputeMode.toLowerCase()}: na etapa fechada você tem um único lance final. Não envie abaixo do seu piso.</p>
        )}

        <div className="copilot-log">
          <div className="copilot-log-head"><strong>Histórico desta sessão</strong>{log.length > 0 && <button type="button" className="text-button" onClick={() => persist([])}><Trash2 aria-hidden="true" />Limpar</button>}</div>
          {log.length === 0 ? <p className="copilot-empty">Os lances registrados aparecem aqui. Ficam só neste navegador.</p> : (
            <ol>
              {log.map((entry) => (
                <li key={entry.at}>
                  <time>{new Date(entry.at).toLocaleTimeString("pt-BR")}</time>
                  <span>Melhor {currency.format(entry.best)}</span>
                  <span className={`status-${entry.status}`}>{STATUS_LABEL[entry.status]}{entry.recommended !== null ? ` · ${currency.format(entry.recommended)}` : ""}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>

      {references.length > 0 && (
        <section className="panel copilot-market">
          <div className="panel-head"><div><p className="panel-title">Preço praticado para este código</p><small>Compras homologadas no Painel de Preços, mesma unidade.</small></div></div>
          <table className="compact-table copilot-ref-table">
            <thead><tr><th>Recorte</th><th>Compras</th><th>Menor</th><th>25%</th><th>Mediana</th></tr></thead>
            <tbody>{references.map((item) => <tr key={item.scope}><td>{item.scope}{item.unit ? ` · ${item.unit}` : ""}</td><td>{item.purchases}</td><td>{currency.format(item.min)}</td><td>{currency.format(item.p25)}</td><td>{currency.format(item.median)}</td></tr>)}</tbody>
          </table>
        </section>
      )}
    </div>
  );
}
