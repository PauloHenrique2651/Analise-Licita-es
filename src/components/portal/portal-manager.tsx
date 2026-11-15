"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, Check, Clock3, Copy, Download, Eye, FilePlus2, FileText, Link2, LoaderCircle, MessageSquareText, Search, Send, X } from "lucide-react";
import { ProcurementPicker, type ProcurementOption } from "@/components/procurement-picker";

export type Share = { id: string; clientName: string; clientEmail: string | null; expiresAt: string; lastAccessedAt: string | null; controlNumber: string; object: string };
type Detail = {
  share: { id: string; clientName: string; clientEmail: string | null; expiresAt: string; revokedAt: string | null; lastAccessedAt: string | null };
  messages: Array<{ id: string; senderType: "client" | "tenant_user"; senderName: string; body: string; createdAt: string }>;
  requests: Array<{ id: string; title: string; description: string | null; status: "requested" | "uploaded" | "accepted" | "rejected"; dueAt: string | null; createdAt: string;
    documents: Array<{ id: string; filename: string; mimeType: string; sizeBytes: number; uploadedBy: string; uploadedAt: string }> }>;
};

const mimeTypes = [["application/pdf", "PDF"], ["image/jpeg", "JPG"], ["image/png", "PNG"], ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Word"], ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Excel"]] as const;
const statusLabel: Record<Detail["requests"][number]["status"], string> = { requested: "Aguardando cliente", uploaded: "Recebido, conferir", accepted: "Aceito", rejected: "Recusado, aguardando reenvio" };
const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
const date = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });
const fileSize = (bytes: number) => bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init, headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers });
  const payload = await response.json().catch(() => ({})) as { data?: T; message?: string };
  if (!response.ok) throw new Error(payload.message ?? "Não foi possível concluir a ação.");
  return payload.data as T;
}

export function PortalManager({ initialShares }: { initialShares: Share[] }) {
  const router = useRouter();
  const [revokedIds, setRevokedIds] = useState<string[]>([]);
  const shares = initialShares.filter((share) => !revokedIds.includes(share.id));
  const [creating, setCreating] = useState(initialShares.length === 0);
  const [procurement, setProcurement] = useState<ProcurementOption | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(initialShares[0]?.id ?? null);
  const [loadedDetail, setDetail] = useState<Detail | null>(null);
  const [filter, setFilter] = useState("");
  const [requestOpen, setRequestOpen] = useState(false);
  const thread = useRef<HTMLDivElement>(null);

  const selected = shares.find((share) => share.id === selectedId) ?? null;
  const detail = loadedDetail && loadedDetail.share.id === selectedId ? loadedDetail : null;

  const loadDetail = useCallback(async (id: string) => {
    try { setDetail(await api<Detail>(`/api/client-portals/${id}`)); } catch { /* mantém a última visão; o erro aparece nas ações */ }
  }, []);
  useEffect(() => {
    if (!selectedId) return;
    const first = window.setTimeout(() => void loadDetail(selectedId), 0);
    const timer = window.setInterval(() => void loadDetail(selectedId), 8_000);
    return () => { window.clearTimeout(first); window.clearInterval(timer); };
  }, [selectedId, loadDetail]);
  const messageCount = detail?.messages.length ?? 0;
  useEffect(() => { thread.current?.scrollTo({ top: thread.current.scrollHeight }); }, [messageCount]);

  function feedback(ok: string | null, fail: string | null = null) { setNotice(ok); setError(fail); }

  async function createShare(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!procurement) return feedback(null, "Toque em um processo da lista de resultados para selecioná-lo.");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setPending("create"); feedback(null); setGeneratedUrl(null);
    try {
      const data = await api<{ id: string; url: string }>("/api/client-portals", { method: "POST", body: JSON.stringify({ procurementId: procurement.id, clientName: form.get("clientName"), clientEmail: form.get("clientEmail") || undefined, expiresInDays: Number(form.get("expiresInDays")) }) });
      setGeneratedUrl(data.url); setSelectedId(data.id); setProcurement(null); formElement.reset();
      feedback("Link gerado. Copie agora: por segurança ele não pode ser exibido de novo.");
      router.refresh();
    } catch (reason) { feedback(null, (reason as Error).message); } finally { setPending(null); }
  }
  async function copyLink() {
    if (!generatedUrl) return;
    // A API de área de transferência só existe com HTTPS; em HTTP usa a cópia clássica pelo campo selecionado.
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(generatedUrl);
      else {
        const input = document.getElementById("generated-link") as HTMLInputElement | null;
        if (!input) throw new Error("no-input");
        input.focus(); input.select(); input.setSelectionRange(0, generatedUrl.length);
        if (!document.execCommand("copy")) throw new Error("copy-failed");
      }
      feedback("Link copiado. Cole no WhatsApp ou e-mail do cliente.");
    } catch { feedback(null, "Não foi possível copiar. Toque no link, selecione tudo e copie."); }
  }
  async function revoke(share: Share) {
    if (!window.confirm(`Revogar o acesso de ${share.clientName}? O link para de funcionar na hora.`)) return;
    setPending("revoke"); feedback(null);
    try { await api(`/api/client-portals/${share.id}`, { method: "DELETE" }); setRevokedIds((ids) => [...ids, share.id]); setSelectedId(null); feedback("Acesso revogado."); router.refresh(); }
    catch (reason) { feedback(null, (reason as Error).message); } finally { setPending(null); }
  }
  async function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return; const formElement = event.currentTarget; const form = new FormData(formElement);
    setPending("message"); feedback(null);
    try { await api(`/api/client-portals/${selected.id}/messages`, { method: "POST", body: JSON.stringify({ body: form.get("body") }) }); formElement.reset(); await loadDetail(selected.id); }
    catch (reason) { feedback(null, (reason as Error).message); } finally { setPending(null); }
  }
  async function requestDocument(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return; const formElement = event.currentTarget; const form = new FormData(formElement);
    const allowedMimeTypes = mimeTypes.map(([type]) => type).filter((type) => form.get(type) === "on");
    if (!allowedMimeTypes.length) return feedback(null, "Marque ao menos um formato aceito.");
    const dueDate = String(form.get("dueAt") ?? "");
    setPending("request"); feedback(null);
    try {
      await api(`/api/client-portals/${selected.id}/document-requests`, { method: "POST", body: JSON.stringify({ title: form.get("title"), description: form.get("description") || undefined, dueAt: dueDate ? new Date(`${dueDate}T23:59:59`).toISOString() : undefined, allowedMimeTypes }) });
      formElement.reset(); setRequestOpen(false); feedback("Solicitação enviada. O cliente já vê no link."); await loadDetail(selected.id);
    } catch (reason) { feedback(null, (reason as Error).message); } finally { setPending(null); }
  }
  async function review(requestId: string, status: "accepted" | "rejected") {
    if (!selected) return; setPending(requestId); feedback(null);
    try { await api(`/api/client-portals/${selected.id}/document-requests/${requestId}`, { method: "PATCH", body: JSON.stringify({ status }) }); await loadDetail(selected.id); feedback(status === "accepted" ? "Documento aceito." : "Documento recusado. O cliente verá o pedido de reenvio."); }
    catch (reason) { feedback(null, (reason as Error).message); } finally { setPending(null); }
  }

  const term = filter.trim().toLowerCase();
  const visibleShares = term ? shares.filter((share) => `${share.clientName} ${share.clientEmail ?? ""} ${share.controlNumber} ${share.object}`.toLowerCase().includes(term)) : shares;
  const pendingReview = detail?.requests.filter((item) => item.status === "uploaded").length ?? 0;

  return <>
    <header className="page-header"><div><p className="eyebrow">GESTÃO</p><h1>Portal do cliente</h1><p>Compartilhe um processo com o cliente por link temporário: mensagens e documentos no mesmo lugar.</p></div>
      <button className="button primary" onClick={() => { setCreating((value) => !value); setGeneratedUrl(null); }}>{creating ? <X aria-hidden="true" /> : <Link2 aria-hidden="true" />}{creating ? "Fechar" : "Novo link"}</button></header>

    {creating && <section className="panel portal-create">
      <div className="panel-head"><div><p className="panel-title">Novo acesso temporário</p><small>O cliente vê só este processo, sem login, até a data de validade.</small></div></div>
      <form onSubmit={createShare} className="portal-create-form">
        <div className="field span-2"><label htmlFor="portal-procurement">Processo</label><ProcurementPicker value={procurement} onChange={setProcurement} /></div>
        <div className="field"><label htmlFor="portal-client">Nome do cliente</label><input id="portal-client" name="clientName" minLength={2} maxLength={120} required placeholder="Ex.: Prefeitura de Niterói" /></div>
        <div className="field"><label htmlFor="portal-email">E-mail do cliente <span className="optional">opcional</span></label><input id="portal-email" name="clientEmail" type="email" placeholder="nome@cliente.com.br" /></div>
        <div className="field"><label htmlFor="portal-days">Validade</label><select id="portal-days" name="expiresInDays" defaultValue="7"><option value="1">1 dia</option><option value="7">7 dias</option><option value="15">15 dias</option><option value="30">30 dias</option></select></div>
        <div className="portal-create-actions"><button className="button primary" disabled={pending === "create"}>{pending === "create" ? <LoaderCircle className="spin" aria-hidden="true" /> : <Link2 aria-hidden="true" />}{pending === "create" ? "Gerando…" : "Gerar link"}</button></div>
      </form>
      {generatedUrl && <div className="generated-link"><Check aria-hidden="true" /><label className="sr-only" htmlFor="generated-link">Link gerado</label><input id="generated-link" value={generatedUrl} readOnly onFocus={(event) => event.currentTarget.select()} /><a className="button secondary" href={generatedUrl} target="_blank" rel="noreferrer">Abrir</a><button className="button primary" type="button" onClick={copyLink}><Copy aria-hidden="true" />Copiar</button></div>}
    </section>}

    {(notice || error) && <div className={error ? "field-error portal-notice" : "form-success portal-notice"} role={error ? "alert" : "status"}>{error ? <X aria-hidden="true" /> : <Check aria-hidden="true" />}{error ?? notice}</div>}

    <div className="portal-workspace">
      <section className="panel portal-shares">
        <div className="panel-head"><div><p className="panel-title">Links ativos</p><small>{shares.length} {shares.length === 1 ? "cliente" : "clientes"}</small></div></div>
        {shares.length > 5 && <div className="portal-share-filter input-with-icon"><Search aria-hidden="true" /><input aria-label="Filtrar links" placeholder="Filtrar por cliente ou processo" value={filter} onChange={(event) => setFilter(event.target.value)} /></div>}
        {shares.length === 0 ? <div className="empty-inline tall"><Link2 aria-hidden="true" /><span>Nenhum link ativo. Gere o primeiro em “Novo link”.</span></div>
          : visibleShares.length === 0 ? <div className="empty-inline"><Search aria-hidden="true" /><span>Nenhum link corresponde ao filtro.</span></div>
          : <div className="share-list">{visibleShares.map((share) => <button className={share.id === selectedId ? "active" : ""} type="button" key={share.id} onClick={() => { setSelectedId(share.id); feedback(null); }}>
            <div><strong>{share.clientName}</strong><p>{share.controlNumber}</p><small>{share.lastAccessedAt ? <><Eye aria-hidden="true" />Visto em {dateTime.format(new Date(share.lastAccessedAt))}</> : "Ainda não acessado"}</small></div>
            <span className="status-badge"><Clock3 aria-hidden="true" />até {date.format(new Date(share.expiresAt))}</span></button>)}</div>}
      </section>

      {selected ? <section className="panel portal-detail">
        <div className="panel-head portal-detail-head"><div><p className="panel-title">{selected.clientName}</p><small>{selected.controlNumber}{selected.clientEmail ? ` · ${selected.clientEmail}` : ""}</small>{selected.object && <p className="portal-object">{selected.object}</p>}</div>
          <button className="button secondary danger" type="button" onClick={() => revoke(selected)} disabled={pending === "revoke"}><Ban aria-hidden="true" />Revogar acesso</button></div>

        <div className="portal-detail-grid">
          <section className="portal-thread" aria-label="Conversa com o cliente">
            <h2><MessageSquareText aria-hidden="true" />Conversa</h2>
            <div className="chat-messages" ref={thread} aria-live="polite">
              {!detail ? <div className="chat-empty"><LoaderCircle className="spin" aria-hidden="true" /></div>
                : detail.messages.length === 0 ? <div className="chat-empty"><MessageSquareText aria-hidden="true" /><p>Nenhuma mensagem. Escreva a primeira atualização para o cliente.</p></div>
                : detail.messages.map((message) => <article className={`chat-message ${message.senderType}`} key={message.id}><div><strong>{message.senderType === "client" ? message.senderName : `${message.senderName} (equipe)`}</strong><time>{dateTime.format(new Date(message.createdAt))}</time></div><p>{message.body}</p></article>)}
            </div>
            <form className="portal-reply" onSubmit={sendMessage}><label className="sr-only" htmlFor="team-message">Mensagem</label><textarea id="team-message" name="body" rows={2} maxLength={4000} placeholder="Escreva uma mensagem para o cliente" required onKeyDown={(event) => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) event.currentTarget.form?.requestSubmit(); }} /><button className="button primary" disabled={pending === "message"} aria-label="Enviar mensagem">{pending === "message" ? <LoaderCircle className="spin" aria-hidden="true" /> : <Send aria-hidden="true" />}Enviar</button></form>
          </section>

          <section className="portal-documents" aria-label="Documentos">
            <h2><FileText aria-hidden="true" />Documentos{pendingReview > 0 && <span className="count-pill">{pendingReview} para conferir</span>}
              <button className="button secondary" type="button" onClick={() => setRequestOpen((value) => !value)}>{requestOpen ? <X aria-hidden="true" /> : <FilePlus2 aria-hidden="true" />}{requestOpen ? "Cancelar" : "Solicitar"}</button></h2>
            {requestOpen && <form className="portal-request-form" onSubmit={requestDocument}>
              <div className="field"><label htmlFor="request-title">Documento</label><input id="request-title" name="title" placeholder="Ex.: Certidão negativa de débitos federais" minLength={2} maxLength={180} required /></div>
              <div className="field"><label htmlFor="request-description">Orientação <span className="optional">opcional</span></label><textarea id="request-description" name="description" rows={2} maxLength={1000} placeholder="O que o cliente precisa saber para enviar certo" /></div>
              <div className="portal-request-row"><div className="field"><label htmlFor="request-date">Prazo <span className="optional">opcional</span></label><input id="request-date" name="dueAt" type="date" min={new Date().toISOString().slice(0, 10)} /></div>
                <fieldset className="mime-options"><legend>Formatos aceitos</legend>{mimeTypes.map(([type, label], index) => <label key={type}><input name={type} type="checkbox" defaultChecked={index === 0} />{label}</label>)}</fieldset></div>
              <button className="button primary" disabled={pending === "request"}>{pending === "request" ? <LoaderCircle className="spin" aria-hidden="true" /> : <FilePlus2 aria-hidden="true" />}Enviar solicitação</button>
            </form>}
            {!detail ? null : detail.requests.length === 0 ? <div className="empty-inline"><FileText aria-hidden="true" /><span>Nenhum documento solicitado.</span></div>
              : <ul className="portal-request-list">{detail.requests.map((item) => <li key={item.id}>
                <div className="portal-request-top"><strong>{item.title}</strong><span className={`status-badge status-${item.status}`}>{statusLabel[item.status]}</span></div>
                {(item.description || item.dueAt) && <small>{item.description}{item.description && item.dueAt ? " · " : ""}{item.dueAt ? `Prazo ${date.format(new Date(item.dueAt))}` : ""}</small>}
                {item.documents.map((doc) => <div className="portal-file" key={doc.id}><FileText aria-hidden="true" /><div><span>{doc.filename}</span><small>{fileSize(doc.sizeBytes)} · {doc.uploadedBy} · {dateTime.format(new Date(doc.uploadedAt))}</small></div><a className="icon-button" href={`/api/client-portals/${selected.id}/documents/${doc.id}`} aria-label={`Baixar ${doc.filename}`}><Download aria-hidden="true" /></a></div>)}
                {item.status === "uploaded" && <div className="portal-review"><button className="button primary" type="button" disabled={pending === item.id} onClick={() => review(item.id, "accepted")}><Check aria-hidden="true" />Aceitar</button><button className="button secondary" type="button" disabled={pending === item.id} onClick={() => review(item.id, "rejected")}><X aria-hidden="true" />Recusar</button></div>}
              </li>)}</ul>}
          </section>
        </div>
      </section> : shares.length > 0 && <section className="panel portal-detail empty-inline tall"><Link2 aria-hidden="true" /><span>Selecione um link para ver a conversa e os documentos.</span></section>}
    </div>
  </>;
}
