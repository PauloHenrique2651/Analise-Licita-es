"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Clock3, FileText, LoaderCircle, MessageSquareText, Send, Upload } from "lucide-react";
import type { PortalSnapshot } from "@/types/portal";

const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
const mimeLabel: Record<string, string> = { "application/pdf": "PDF", "image/jpeg": "JPG", "image/png": "PNG", "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel" };
const requestStatus: Record<string, { label: string; tone: string }> = {
  requested: { label: "Pendente", tone: "status-requested" },
  uploaded: { label: "Enviado, em análise", tone: "status-uploaded" },
  accepted: { label: "Aceito", tone: "status-accepted" },
  rejected: { label: "Recusado, envie novamente", tone: "status-rejected" },
};

export function PortalLive({ token, initialData }: { token: string; initialData: PortalSnapshot }) {
  const [snapshot, setSnapshot] = useState(initialData);
  const [senderName, setSenderName] = useState(initialData.share.clientName);
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [messageError, setMessageError] = useState<string | null>(null);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"acompanhamento" | "mensagens" | "documentos">(
    initialData.documentRequests.some((request) => request.status === "requested" || request.status === "rejected") ? "documentos" : "mensagens",
  );

  async function refresh() {
    const response = await fetch(`/api/public-portal/${encodeURIComponent(token)}`, { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json() as { data: PortalSnapshot };
    setSnapshot(payload.data);
  }

  async function uploadDocument(event: React.FormEvent<HTMLFormElement>, requestId: string) {
    event.preventDefault(); setDocumentError(null); setUploadingId(requestId);
    try {
      const formElement = event.currentTarget;
      const form = new FormData(formElement);
      form.set("uploaderName", senderName);
      const response = await fetch(`/api/public-portal/${encodeURIComponent(token)}/documents/${requestId}`, { method: "POST", body: form });
      const payload = await response.json() as { message?: string };
      if (!response.ok) throw new Error(payload.message ?? "Não foi possível enviar o arquivo.");
      formElement.reset();
      setChosen((current) => { const next = { ...current }; delete next[requestId]; return next; });
      await refresh();
    } catch (uploadError) {
      setDocumentError(uploadError instanceof Error ? uploadError.message : "Não foi possível enviar o arquivo.");
    } finally {
      setUploadingId(null);
    }
  }

  const refreshRef = useRef(refresh);
  useEffect(() => { refreshRef.current = refresh; });
  useEffect(() => {
    const timer = window.setInterval(() => void refreshRef.current(), 5_000);
    return () => window.clearInterval(timer);
  }, []);

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

  const pendingDocuments = snapshot.documentRequests.filter((request) => request.status === "requested" || request.status === "rejected").length;

  return (
    <div className="public-content">
      <section className="public-title">
        <p className="public-greeting">Olá, {snapshot.share.clientName}</p>
        <h1>{snapshot.procurement ? `Processo ${snapshot.procurement.controlNumber}` : "Portal seguro do cliente"}</h1>
        <div className="public-meta">
          {snapshot.procurement?.statusName && <span className="status-badge">{snapshot.procurement.statusName}</span>}
          <span><Clock3 aria-hidden="true" />Acesso válido até {dateTime.format(new Date(snapshot.share.expiresAt))}</span>
        </div>
        {snapshot.procurement && <details className="public-object"><summary>Objeto do processo</summary><p>{snapshot.procurement.objectDescription}</p></details>}
      </section>
      <nav className="public-tabs" aria-label="Áreas do processo">
        <button type="button" className={activeTab === "documentos" ? "active" : ""} onClick={() => setActiveTab("documentos")}>Documentos{pendingDocuments > 0 && <span className="count-pill" aria-label={`${pendingDocuments} pendente${pendingDocuments > 1 ? "s" : ""}`}>{pendingDocuments}</span>}</button>
        <button type="button" className={activeTab === "mensagens" ? "active" : ""} onClick={() => setActiveTab("mensagens")}>Mensagens{snapshot.messages.length > 0 && <span className="count-pill">{snapshot.messages.length}</span>}</button>
        <button type="button" className={activeTab === "acompanhamento" ? "active" : ""} onClick={() => setActiveTab("acompanhamento")}>Andamento</button>
      </nav>
      {activeTab === "acompanhamento" && <section className="panel timeline-panel">
        <div className="panel-head"><div><p className="panel-title">Linha do tempo</p><small>Atualização automática a cada 5 segundos</small></div></div>
        {snapshot.events.length === 0 ? <div className="empty-inline tall"><Clock3 aria-hidden="true" /><span>Nenhuma atualização de andamento ainda. As novidades aparecem aqui e em Mensagens.</span></div> : <ol className="timeline-list">{snapshot.events.map((event) => <li key={event.id}><time>{dateTime.format(new Date(event.createdAt))}</time><strong>{event.title}</strong>{event.description && <p>{event.description}</p>}</li>)}</ol>}
      </section>}
      {activeTab === "mensagens" && <aside className="panel public-chat public-tab-panel">
        <div className="panel-head"><div><p className="panel-title">Mensagens</p><small>Conversa vinculada a este processo</small></div></div>
        <div className="chat-messages" aria-live="polite">{snapshot.messages.length === 0 ? <div className="chat-empty"><MessageSquareText aria-hidden="true" /><p>Nenhuma mensagem ainda.</p></div> : snapshot.messages.map((message) => <article className={`chat-message ${message.senderType}`} key={message.id}><div><strong>{message.senderName}</strong><time>{dateTime.format(new Date(message.createdAt))}</time></div><p>{message.body}</p></article>)}</div>
        <form className="chat-compose portal-compose" onSubmit={sendMessage}><label className="sr-only" htmlFor="portal-sender">Seu nome</label><input id="portal-sender" value={senderName} onChange={(event) => setSenderName(event.target.value)} maxLength={120} required /><label className="sr-only" htmlFor="portal-message">Mensagem</label><textarea id="portal-message" value={body} onChange={(event) => setBody(event.target.value)} placeholder="Escreva uma mensagem" rows={3} maxLength={4000} required /><button className="icon-button" aria-label="Enviar mensagem" disabled={pending}>{pending ? <LoaderCircle className="spin" aria-hidden="true" /> : <Send aria-hidden="true" />}</button>{messageError && <small className="field-error" role="alert">{messageError}</small>}</form>
      </aside>}
      {activeTab === "documentos" && <section className="panel document-requests">
        <div className="panel-head"><div><p className="panel-title">Documentos solicitados</p><small>Arquivos pendentes e enviados</small></div></div>
        {snapshot.documentRequests.length === 0 ? <div className="empty-inline"><FileText aria-hidden="true" /><span>Nenhum documento solicitado. Aguarde uma solicitação da equipe responsável.</span></div> : <div className="request-list">{snapshot.documentRequests.map((request) => <article key={request.id}><FileText aria-hidden="true" /><div><strong>{request.title}</strong><p>{request.description ?? "Sem observações adicionais."}</p><small>{request.dueAt ? `Prazo: ${dateTime.format(new Date(request.dueAt))} · ` : ""}Limite: {Math.round(request.maxSizeBytes / 1_048_576)} MB · {request.allowedMimeTypes.map((type) => mimeLabel[type] ?? type).join(", ")}</small><span className={`status-badge ${requestStatus[request.status]?.tone ?? ""}`}>{request.status === "accepted" && <Check aria-hidden="true" />}{requestStatus[request.status]?.label ?? request.status}</span></div>{request.status === "accepted" ? null : <form className="document-upload" onSubmit={(event) => uploadDocument(event, request.id)}><label className="button secondary file-choose"><Upload aria-hidden="true" /><span>{chosen[request.id] ?? "Escolher arquivo"}</span><input name="file" type="file" accept={request.allowedMimeTypes.join(",")} required onChange={(event) => { const name = event.currentTarget.files?.[0]?.name; setChosen((current) => ({ ...current, [request.id]: name ?? "Escolher arquivo" })); }} /></label><button className="button primary" disabled={uploadingId === request.id}>{uploadingId === request.id ? <LoaderCircle className="spin" aria-hidden="true" /> : <Upload aria-hidden="true" />}{uploadingId === request.id ? "Enviando…" : request.status === "uploaded" ? "Enviar nova versão" : "Enviar"}</button></form>}</article>)}</div>}
        {documentError && <div className="field-error portal-error" role="alert">{documentError}</div>}
      </section>}
    </div>
  );
}
