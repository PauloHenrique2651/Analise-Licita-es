"use client";

import { Download, ExternalLink, FileClock, FileText, Landmark, ScrollText } from "lucide-react";
import type {
  OfficialContract, OfficialDocument, PriceRegistrationMinute, ProcurementHistoryEvent,
} from "@/types/procurement-detail";

function date(value: string | null) {
  if (!value) return "Não informado";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString("pt-BR");
}

function currency(value: number | null) {
  return value === null ? "Não informado" : Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function Empty({ message, warning }: { message: string; warning?: string }) {
  return <div className="official-data-empty"><FileText aria-hidden="true" /><strong>{warning ?? message}</strong><span>A plataforma não cria informações ausentes na publicação oficial.</span></div>;
}

export function OfficialDocuments({ records, warning }: { records: OfficialDocument[]; warning?: string }) {
  if (!records.length) return <Empty warning={warning} message="Nenhum arquivo publicado para esta licitação." />;
  return <section className="panel official-data-panel"><header><div><p className="eyebrow">FONTE OFICIAL</p><h2>Arquivos do processo</h2><p>{records.length} {records.length === 1 ? "arquivo disponível" : "arquivos disponíveis"}</p></div><FileText aria-hidden="true" /></header><div className="official-data-list">{records.map((record) => <article key={record.id}><div className="official-data-icon"><FileText aria-hidden="true" /></div><div><strong>{record.title}</strong><span>{record.type ?? "Documento"} · Publicado em {date(record.publishedAt)}</span></div><a className="button icon-button" href={record.url} target="_blank" rel="noopener noreferrer" aria-label={`Baixar ${record.title}`}><Download aria-hidden="true" /></a></article>)}</div></section>;
}

export function OfficialMinutes({ records, warning }: { records: PriceRegistrationMinute[]; warning?: string }) {
  if (!records.length) return <Empty warning={warning} message="Nenhuma ata de registro de preços vinculada." />;
  return <section className="panel official-data-panel"><header><div><p className="eyebrow">REGISTRO DE PREÇOS</p><h2>Atas vinculadas</h2><p>{records.length} {records.length === 1 ? "ata encontrada" : "atas encontradas"}</p></div><ScrollText aria-hidden="true" /></header><div className="official-card-grid">{records.map((record) => <article key={record.id}><div className="official-card-head"><strong>Ata {record.number}{record.year ? ` / ${record.year}` : ""}</strong><span className={`status-pill ${record.cancelled ? "danger" : "success"}`}>{record.cancelled ? "Cancelada" : "Ativa"}</span></div><dl><div><dt>Assinatura</dt><dd>{date(record.signedAt)}</dd></div><div><dt>Vigência</dt><dd>{date(record.startsAt)} — {date(record.endsAt)}</dd></div><div><dt>Permite adesão</dt><dd>{record.allowsAdhesion === null ? "Não informado" : record.allowsAdhesion ? "Sim" : "Não"}</dd></div></dl></article>)}</div></section>;
}

export function OfficialContracts({ records, warning }: { records: OfficialContract[]; warning?: string }) {
  if (!records.length) return <Empty warning={warning} message="Nenhum contrato ou empenho vinculado." />;
  return <section className="panel official-data-panel"><header><div><p className="eyebrow">EXECUÇÃO CONTRATUAL</p><h2>Contratos e empenhos</h2><p>{records.length} {records.length === 1 ? "registro encontrado" : "registros encontrados"}</p></div><Landmark aria-hidden="true" /></header><div className="official-card-grid">{records.map((record) => <article key={record.id}><div className="official-card-head"><strong>{record.number}</strong><span className="status-pill neutral">{record.type ?? "Contrato / empenho"}</span></div><p>{record.object ?? "Objeto não informado"}</p><dl><div><dt>Fornecedor</dt><dd>{record.supplier ?? "Não informado"}</dd></div><div><dt>Valor global</dt><dd>{currency(record.value)}</dd></div><div><dt>Assinatura</dt><dd>{date(record.signedAt)}</dd></div><div><dt>Vigência</dt><dd>{date(record.startsAt)} — {date(record.endsAt)}</dd></div></dl></article>)}</div></section>;
}

export function OfficialHistory({ records, warning }: { records: ProcurementHistoryEvent[]; warning?: string }) {
  if (!records.length) return <Empty warning={warning} message="Nenhum evento de histórico publicado." />;
  return <section className="panel official-data-panel history-panel"><header><div><p className="eyebrow">RASTREABILIDADE</p><h2>Histórico oficial</h2><p>{records.length} {records.length === 1 ? "evento registrado" : "eventos registrados"}</p></div><FileClock aria-hidden="true" /></header><ol className="official-timeline">{records.map((record) => <li key={record.id}><span aria-hidden="true" /><div><div><strong>{record.action} · {record.category}</strong><time>{date(record.occurredAt)}</time></div>{record.name && <p>{record.name}</p>}{record.reason && <small>{record.reason}</small>}</div></li>)}</ol></section>;
}

export function OfficialDataUnavailable({ links }: { links: { label: string; url: string }[] }) {
  return <div className="official-data-empty"><ExternalLink aria-hidden="true" /><strong>Detalhes estruturados não disponíveis nesta fonte.</strong><span>Consulte o processo no portal oficial para verificar anexos e atualizações.</span>{links[0] && <a className="button primary" href={links[0].url} target="_blank" rel="noopener noreferrer">Abrir portal oficial<ExternalLink aria-hidden="true" /></a>}</div>;
}
