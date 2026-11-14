"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Bot, LoaderCircle, SendHorizontal, Trash2, X } from "lucide-react";

interface Message { role: "user" | "assistant"; content: string }

const SUGGESTIONS = [
  "Como funciona a disputa em modo aberto-fechado?",
  "O que é exclusiva para ME/EPP?",
  "Quando vale a pena impugnar um edital?",
];

export function AssistantPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages, pending]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || pending) return;
    const next: Message[] = [...messages, { role: "user", content }];
    setMessages(next);
    setInput("");
    setError(null);
    setPending(true);
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.slice(-12), page: pathname }),
      });
      const body = (await response.json()) as { reply?: string; message?: string };
      if (!response.ok || !body.reply) throw new Error(body.message ?? "Falha ao consultar o assistente.");
      setMessages([...next, { role: "assistant", content: body.reply }]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Falha ao consultar o assistente.");
    } finally {
      setPending(false);
    }
  }

  if (!open) return null;
  return (
    <div className="drawer-layer procurement-drawer-layer">
      <button className="drawer-scrim" aria-label="Fechar assistente" onClick={onClose} tabIndex={-1} />
      <aside className="procurement-drawer assistant-panel" role="dialog" aria-modal="true" aria-labelledby="assistant-title">
        <header className="pd-head">
          <div className="pd-head-meta"><Bot aria-hidden="true" /><strong id="assistant-title">Assistente</strong></div>
          <div className="pd-head-actions">
            {messages.length > 0 && <button className="icon-button" type="button" onClick={() => { setMessages([]); setError(null); }} aria-label="Limpar conversa" title="Limpar conversa"><Trash2 aria-hidden="true" /></button>}
            <button className="icon-button" type="button" onClick={onClose} aria-label="Fechar"><X aria-hidden="true" /></button>
          </div>
        </header>
        <div className="assistant-thread" aria-live="polite">
          {messages.length === 0 && (
            <div className="assistant-intro">
              <p>Tire dúvidas sobre licitações, modalidades, disputa e como usar o Nexo. Eu não vejo os dados da sua conta nem invento números: para isso, use as telas de busca e preços.</p>
              <div>{SUGGESTIONS.map((suggestion) => <button key={suggestion} type="button" className="button" onClick={() => void send(suggestion)}>{suggestion}</button>)}</div>
            </div>
          )}
          {messages.map((message, index) => <div key={index} className={`assistant-message ${message.role}`}>{message.content}</div>)}
          {pending && <div className="assistant-message assistant"><LoaderCircle className="spin" aria-hidden="true" />Pensando…</div>}
          {error && <div className="form-error" role="alert">{error}</div>}
          <div ref={endRef} />
        </div>
        <form className="assistant-form" onSubmit={(event) => { event.preventDefault(); void send(input); }}>
          <label className="sr-only" htmlFor="assistant-input">Sua pergunta</label>
          <textarea ref={inputRef} id="assistant-input" rows={2} maxLength={4000} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(input); } }} placeholder="Pergunte algo… (Enter envia)" />
          <button className="button primary" type="submit" disabled={pending || !input.trim()} aria-label="Enviar"><SendHorizontal aria-hidden="true" /></button>
        </form>
        <p className="assistant-note">Respostas geradas por IA podem conter erros. Confirme no edital e com um profissional habilitado.</p>
      </aside>
    </div>
  );
}
