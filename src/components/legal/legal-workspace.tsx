"use client";

import { Check, Copy, Download, FilePenLine, Scale } from "lucide-react";
import { useMemo, useState } from "react";

const templates = [
  { id: "esclarecimento", title: "Pedido de esclarecimento", description: "Solicite esclarecimento objetivo sobre cláusula, item ou requisito do edital.", subject: "Pedido de esclarecimento — [NÚMERO DO PROCESSO]" },
  { id: "impugnacao", title: "Impugnação ao edital", description: "Estruture uma impugnação com fatos, fundamentos e pedido claro.", subject: "Impugnação ao edital — [NÚMERO DO PROCESSO]" },
  { id: "intencao-recurso", title: "Intenção de recurso", description: "Registre uma manifestação inicial de intenção recursal.", subject: "Intenção de recurso — [NÚMERO DO PROCESSO]" },
  { id: "recurso", title: "Recurso administrativo", description: "Monte um rascunho de recurso para revisão jurídica antes do protocolo.", subject: "Recurso administrativo — [NÚMERO DO PROCESSO]" },
  { id: "contrarrazoes", title: "Contrarrazões", description: "Prepare a resposta a recurso apresentado por outro participante.", subject: "Contrarrazões — [NÚMERO DO PROCESSO]" },
] as const;

function draft(title: string, subject: string, company: string, procurement: string) {
  return `À autoridade competente\n\nAssunto: ${subject.replace("[NÚMERO DO PROCESSO]", procurement || "[NÚMERO DO PROCESSO]")}\n\n${company || "[RAZÃO SOCIAL]"}, inscrita no CNPJ sob nº [CNPJ], vem, respeitosamente, apresentar ${title.toLowerCase()}.\n\n1. CONTEXTO\nDescreva objetivamente o processo, item e o fato relevante.\n\n2. FUNDAMENTOS\nIndique os dispositivos do edital, legislação aplicável e documentos que sustentam a manifestação.\n\n3. PEDIDO\nApresente de forma clara a providência solicitada.\n\nTermos em que,\nPede deferimento.\n\n[LOCAL], [DATA]\n\n${company || "[RAZÃO SOCIAL]"}\n[RESPONSÁVEL / CONTATO]`;
}

export function LegalWorkspace() {
  const [selectedId, setSelectedId] = useState<(typeof templates)[number]["id"]>("esclarecimento");
  const [company, setCompany] = useState(""); const [procurement, setProcurement] = useState(""); const [body, setBody] = useState(""); const [copied, setCopied] = useState(false);
  const selected = templates.find((template) => template.id === selectedId) ?? templates[0];
  const generated = useMemo(() => draft(selected.title, selected.subject, company, procurement), [selected, company, procurement]);
  const content = body || generated;
  function choose(id: typeof selectedId) { setSelectedId(id); setBody(""); setCopied(false); }
  async function copy() { await navigator.clipboard.writeText(content); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
  function download() { const blob = new Blob([content], { type: "text/plain;charset=utf-8" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${selected.id}-${(procurement || "rascunho").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.txt`; anchor.click(); URL.revokeObjectURL(url); }
  return <><header className="page-header"><div><p className="eyebrow">JURÍDICO</p><h1>Banco de peças jurídicas</h1><p>Rascunhos editáveis para revisão e protocolo exclusivamente no portal oficial.</p></div></header><div className="legal-notice"><Scale aria-hidden="true" /><p>Os modelos são pontos de partida e devem ser revisados por profissional habilitado antes de qualquer protocolo.</p></div><section className="legal-layout"><aside className="panel legal-templates"><div className="panel-head"><div><p className="panel-title">Modelos</p><small>Selecione a manifestação desejada.</small></div></div>{templates.map((template) => <button key={template.id} type="button" className={template.id === selected.id ? "active" : ""} onClick={() => choose(template.id)}><FilePenLine aria-hidden="true" /><span><strong>{template.title}</strong><small>{template.description}</small></span></button>)}</aside><section className="panel legal-editor"><div className="panel-head"><div><p className="panel-title">{selected.title}</p><small>Preencha os dados e adapte o texto ao caso concreto.</small></div></div><div className="legal-fields"><label>Empresa<input value={company} onChange={(event) => { setCompany(event.target.value); setBody(""); }} placeholder="Razão social" /></label><label>Processo<input value={procurement} onChange={(event) => { setProcurement(event.target.value); setBody(""); }} placeholder="Ex.: PE 90001/2026" /></label></div><label className="legal-body">Texto do rascunho<textarea value={content} onChange={(event) => setBody(event.target.value)} rows={18} /></label><div className="drawer-actions"><button type="button" className="button secondary" onClick={() => void copy()}>{copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}{copied ? "Copiado" : "Copiar texto"}</button><button type="button" className="button primary" onClick={download}><Download aria-hidden="true" />Baixar rascunho</button></div></section></section></>;
}
