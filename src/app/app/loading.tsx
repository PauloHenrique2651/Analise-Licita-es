// Esqueleto exibido enquanto qualquer tela de /app carrega (Next.js usa este arquivo como fallback de Suspense).
export default function Loading() {
  return (
    <div className="skeleton-page" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Carregando…</span>
      <div className="sk-head"><i className="sk sk-title" /><i className="sk sk-line" /></div>
      <div className="sk-kpis">{Array.from({ length: 6 }, (_, index) => <div className="sk-card" key={index}><i className="sk sk-label" /><i className="sk sk-value" /></div>)}</div>
      <div className="sk-panel">
        <i className="sk sk-bar" />
        {Array.from({ length: 7 }, (_, index) => <div className="sk-row" key={index}><i className="sk" /><i className="sk" /><i className="sk" /><i className="sk" /></div>)}
      </div>
    </div>
  );
}
