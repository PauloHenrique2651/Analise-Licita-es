"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Cookie, X } from "lucide-react";
import { OPEN_PREFERENCES_EVENT, readConsent, saveConsent } from "@/lib/cookie-consent";

/** Aviso de cookies: "Aceitar" e "Rejeitar" com o mesmo destaque, sem opções pré-marcadas, revogável a qualquer momento. */
export function CookieConsent() {
  const [ready, setReady] = useState(false);
  const [banner, setBanner] = useState(false);
  const [panel, setPanel] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  const openPanel = useCallback(() => {
    const current = readConsent();
    setAnalytics(current?.analytics ?? false);
    setMarketing(current?.marketing ?? false);
    setPanel(true);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- leitura única do localStorage após a hidratação
    setBanner(readConsent() === null);
    setReady(true);
    window.addEventListener(OPEN_PREFERENCES_EVENT, openPanel);
    return () => window.removeEventListener(OPEN_PREFERENCES_EVENT, openPanel);
  }, [openPanel]);

  useEffect(() => {
    if (!panel) return;
    dialogRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setPanel(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [panel]);

  function decide(choice: { analytics: boolean; marketing: boolean }) {
    saveConsent(choice);
    setBanner(false);
    setPanel(false);
  }

  if (!ready) return null;
  return (
    <>
      {banner && !panel && (
        <section className="cookie-banner" role="region" aria-label="Aviso de cookies">
          <Cookie aria-hidden="true" className="cookie-icon" />
          <div className="cookie-text">
            <strong>Sua privacidade</strong>
            <p>Usamos apenas cookies essenciais para manter você conectado e proteger a sessão. Não usamos cookies de publicidade. Você pode ajustar as preferências quando quiser. <Link href="/politica-de-cookies">Política de cookies</Link></p>
          </div>
          <div className="cookie-actions">
            <button type="button" className="button" onClick={() => decide({ analytics: false, marketing: false })}>Rejeitar opcionais</button>
            <button type="button" className="button" onClick={() => decide({ analytics: true, marketing: true })}>Aceitar todos</button>
            <button type="button" className="button ghost" onClick={openPanel}>Personalizar</button>
          </div>
        </section>
      )}

      {panel && (
        <div className="cookie-overlay">
          <button className="drawer-scrim" aria-label="Fechar preferências de cookies" onClick={() => setPanel(false)} tabIndex={-1} />
          <div className="cookie-dialog" role="dialog" aria-modal="true" aria-labelledby="cookie-title" tabIndex={-1} ref={dialogRef}>
            <header>
              <h2 id="cookie-title">Preferências de cookies</h2>
              <button type="button" className="icon-button" onClick={() => setPanel(false)} aria-label="Fechar"><X aria-hidden="true" /></button>
            </header>
            <p className="cookie-lead">Escolha quais categorias você autoriza. Sua escolha fica salva neste navegador e pode ser alterada em “Preferências de cookies”, no rodapé.</p>
            <ul className="cookie-categories">
              <li>
                <div><strong>Estritamente necessários</strong><p>Login, sessão e segurança. Sem eles o site não funciona, por isso não podem ser desativados.</p></div>
                <span className="cookie-always">Sempre ativos</span>
              </li>
              <li>
                <div><strong>Estatísticas</strong><p>Medem o uso para melhorar o produto. Hoje não utilizamos; só seriam ativados com a sua autorização.</p></div>
                <label className="cookie-switch"><input type="checkbox" checked={analytics} onChange={(event) => setAnalytics(event.target.checked)} /><span className="sr-only">Permitir cookies de estatísticas</span><i aria-hidden="true" /></label>
              </li>
              <li>
                <div><strong>Marketing</strong><p>Personalizam comunicações e anúncios. Hoje não utilizamos.</p></div>
                <label className="cookie-switch"><input type="checkbox" checked={marketing} onChange={(event) => setMarketing(event.target.checked)} /><span className="sr-only">Permitir cookies de marketing</span><i aria-hidden="true" /></label>
              </li>
            </ul>
            <div className="cookie-actions">
              <button type="button" className="button" onClick={() => decide({ analytics: false, marketing: false })}>Rejeitar opcionais</button>
              <button type="button" className="button" onClick={() => decide({ analytics: true, marketing: true })}>Aceitar todos</button>
              <button type="button" className="button primary" onClick={() => decide({ analytics, marketing })}>Salvar escolhas</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function CookiePreferencesButton({ className }: { className?: string }) {
  return <button type="button" className={className ?? "legal-link-button"} onClick={() => window.dispatchEvent(new Event(OPEN_PREFERENCES_EVENT))}>Preferências de cookies</button>;
}
