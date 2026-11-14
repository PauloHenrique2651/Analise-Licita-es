"use client";

import { useEffect, useState } from "react";
import { Check, Clock3, FileText, LoaderCircle, MessageSquareText, Send, Upload } from "lucide-react";
import type { PortalSnapshot } from "@/types/portal";

const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

export function PortalLive({ token, initialData }: { token: string; initialData: PortalSnapshot }) {
  const [snapshot, setSnapshot] = useState(initialData);
  const [senderName, setSenderName] = useState(initialData.share.clientName);
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"acompanhamento" | "mensagens" | "documentos">("acompanhamento");

  async function refresh() {
    const response = await fetch(`/api/public-portal/${encodeURIComponent(token)}`, { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json() as { data: PortalSnapshot };
    setSnapshot(payload.data);
  }

  async function uploadDocument(event: React.FormEvent<HTMLFormElement>, requestId: string) {
    event.preventDefault(); setDocumentError(null); setUploadingId(requestId);
    try {
      const form = new FormData(event.currentTarget);
      form.set("uploaderName", senderName);
      const response = await fetch(`/api/public-portal/${encodeURIComponent(token)}/documents/${requestId}`, { method: "POST", body: form });
      const payload = await response.json() as { message?: string };
      if (!response.ok) throw new Error(payload.message ?? "Não foi possível enviar o arquivo.");
      event.currentTarget.reset();
      await refresh();
    } catch (uploadError) {
      setDocumentError(uploadError instanceof Error ? uploadError.message : "Não foi possível enviar o arquivo.");
    } finally {
      setUploadingId(null);
    }
  }

  useEffect(() => {
    const timer = window.setInterval(() => void refresh(), 5_000);
    return () => window.clearInterval(timer);
  });

  async function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessageError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/public-portal/${encodeURIComponent(token)}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senderName, body }),
      });
      const payload = await response.json() as { message?: string };
      if (!response.ok) throw new Error(payload.message ?? "Não foi possível enviar.");
      setBody("");
      await refresh();
    } catch (sendError) {
      setMessageError(sendError instanceof Error ? sendError.message : "Não foi possível enviar.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="public-content">
      <section className="public-title">
        <p className="eyebrow">ACOMPANHAMENTO DE PROCESSO</p>
        <h1>{snapshot.procurement?.objectDescription ?? "Portal seguro do cliente"}</h1>
        <p>
          {snapshot.procurement
            ? `${snapshot.procurement.controlNumber} · ${snapshot.procurement.statusName ?? "Situação não informada"}`
            : "Acompanhamento compartilhado pelo licitante."}
        </p>
      </section>
      <nav className="public-tabs" aria-label="Áreas do processo"><button type="button" className={activeTab === "acompanhamento" ? "active" : ""} onClick={() => setActiveTab("acompanhamento")}>Acompanhamento</button><button type="button" className={activeTab === "mensagens" ? "active" : ""} onClick={() => setActiveTab("mensagens")}>Mensagens</button><button type="button" className={activeTab === "documentos" ? "active" : ""} onClick={() => setActiveTab("documentos")}>Documentos</button></nav>
      {activeTab === "acompanhamento" && <section className="panel timeline-panel">
        <div className="panel-head"><div><p className="panel-title">Linha do tempo</p><small>Atualização automática a cada 5 segundos</small></div></div>
        {snapshot.events.length === 0 ? <div className="empty-inline tall"><Clock3 aria-hidden="true" /><span>Nenhum evento público registrado.</span></div> : <ol className="timeline-list">{snapshot.events.map((event) => <li key={event.id}><time>{dateTime.format(new Date(event.createdAt))}</time><strong>{event.title}</strong>{event.description && <p>{event.description}</p>}</li>)}</ol>}
      </section>}
      {activeTab === "mensagens" && <aside className="panel public-chat public-tab-panel">
        <div className="panel-head"><div><p className="panel-title">Mensagens</p><small>Conversa vinculada a este processo</small></div></div>
        <div className="chat-messages" aria-live="polite">{snapshot.messages.length === 0 ? <div className="chat-empty"><MessageSquareText aria-hidden="true" /><p>Nenhuma mensagem ainda.</p></div> : snapshot.messages.map((message) => <article className={`chat-message ${message.senderType}`} key={message.id}><div><strong>{message.senderName}</strong><time>{dateTime.format(new Date(message.createdAt))}</time></div><p>{message.body}</p></article>)}</div>
        <form className="chat-compose portal-compose" onSubmit={sendMessage}><label className="sr-only" htmlFor="portal-sender">Seu nome</label><input id="portal-sender" value={senderName} onChange={(event) => setSenderName(event.target.value)} maxLength={120} required /><label className="sr-only" htmlFor="portal-message">Mensagem</label><textarea id="portal-message" value={body} onChange={(event) => setBody(event.target.value)} placeholder="Escreva uma mensagem" rows={3} maxLength={4000} required /><button className="icon-button" aria-label="Enviar mensagem" disabled={pending}>{pending ? <LoaderCircle className="spin" aria-hidden="true" /> : <Send aria-hidden="true" />}</button>{messageError && <small className="field-error" role="alert">{messageError}</small>}</form>
      </aside>}
      {activeTab === "documentos" && <section className="panel document-requests">
        <div className="panel-head"><div><p className="panel-title">Documentos solicitados</p><small>Arquivos pendentes e enviados</small></div></div>
        {snapshot.documentRequests.length === 0 ? <div className="empty-inline"><FileText aria-hidden="true" /><span>Nenhum documento solicitado. Aguarde uma solicitação da equipe responsável.</span></div> : <div className="request-list">{snapshot.documentRequests.map((request) => <article key={request.id}><FileText aria-hidden="true" /><div><strong>{request.title}</strong><p>{request.description ?? "Sem observações adicionais."}</p><small>{request.dueAt ? `Prazo: ${dateTime.format(new Date(request.dueAt))} · ` : ""}Limite: {Math.round(request.maxSizeBytes / 1_048_576)} MB · {request.allowedMimeTypes.join(", ")}</small></div>{request.status === "accepted" ? <span className="status-badge"><Check aria-hidden="true" />Aceito</span> : <form className="document-upload" onSubmit={(event) => uploadDocument(event, request.id)}><label className="button secondary"><Upload aria-hidden="true" />Escolher arquivo<input name="file" type="file" accept={request.allowedMimeTypes.join(",")} required /></label><button className="button primary" disabled={uploadingId === request.id}>{uploadingId === request.id ? <LoaderCircle className="spin" aria-hidden="true" /> : <Upload aria-hidden="true" />}{uploadingId === request.id ? "Enviando…" : request.status === "uploaded" ? "Enviar nova versão" : "Enviar"}</button></form>}</article>)}</div>}
        {documentError && <div className="field-error portal-error" role="alert">{documentError}</div>}
      </section>}
    </div>
  );
}
