"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { useRef, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  BarChart3, BellRing, Boxes, CircleHelp, ClipboardCheck, ExternalLink, FileArchive,
  FileCheck2, FileClock, Info, Landmark, MapPinned, MessageSquareText, ScrollText, SearchCheck, ShieldAlert,
} from "lucide-react";
import {
  OfficialContracts, OfficialDataUnavailable, OfficialDocuments, OfficialHistory, OfficialMinutes,
} from "@/components/procurement/procurement-official-data";
import type { PncpProcurementDetails } from "@/types/procurement-detail";

type SectionId = "informacoes" | "itens" | "arquivos" | "atas" | "contratos" | "historico" | "documentos" | "mensagens" | "relatorios" | "impugnacoes" | "esclarecimentos" | "diligencias" | "notificacoes" | "regionalidade";
type OfficialLink = { label: string; url: string };

const sections = [
  ["informacoes", "Informações", Info], ["itens", "Itens / Lotes", Boxes], ["arquivos", "Arquivos oficiais", FileArchive],
  ["atas", "Atas de preços", ScrollText], ["contratos", "Contratos / empenhos", Landmark], ["historico", "Histórico oficial", FileClock],
  ["documentos", "Documentos internos", ClipboardCheck], ["mensagens", "Mensagens", MessageSquareText], ["relatorios", "Relatórios", BarChart3],
  ["impugnacoes", "Impugnações", ShieldAlert], ["esclarecimentos", "Esclarecimentos", CircleHelp], ["diligencias", "Diligências", SearchCheck],
  ["notificacoes", "Notificações", BellRing], ["regionalidade", "Regionalidade", MapPinned],
] as const;

function currentSection(): SectionId {
  const hash = window.location.hash.slice(1);
  return sections.some(([id]) => id === hash) ? hash as SectionId : "informacoes";
}

function subscribeToHash(callback: () => void) {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}

function ExternalActions({ links, compact = false }: { links: OfficialLink[]; compact?: boolean }) {
  if (!links.length) return <p>O portal de origem não forneceu um endereço individual válido para esta publicação.</p>;
  return <div className={compact ? "workspace-external compact" : "workspace-external"}>{links.map((link) => <a className="button primary" href={link.url} target="_blank" rel="noopener noreferrer" key={link.url}>{link.label}<ExternalLink aria-hidden="true" /></a>)}</div>;
}

function SourceOnlySection({ title, description, links }: { title: string; description: string; links: OfficialLink[] }) {
  return <section className="panel workspace-empty"><FileCheck2 aria-hidden="true" /><p className="eyebrow">ACOMPANHAMENTO</p><h2>{title}</h2><p>{description}</p><ExternalActions links={links} /></section>;
}

export function ProcurementWorkspace({ information, items, officialLinks, location, officialData }: { information: ReactNode; items: ReactNode; officialLinks: OfficialLink[]; location: string; officialData: PncpProcurementDetails }) {
  const active = useSyncExternalStore(subscribeToHash, currentSection, () => "informacoes");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function select(section: SectionId) {
    if (window.location.hash === `#${section}`) return;
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${section}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }

  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!(["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"] as string[]).includes(event.key)) return;
    event.preventDefault();
    const direction = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : -1;
    const next = (index + direction + sections.length) % sections.length;
    select(sections[next][0]);
    tabRefs.current[next]?.focus();
  }

  return <>
    <aside className="participation-notice"><Info aria-hidden="true" /><div><strong>Ambiente de apoio ao licitante</strong><span>Prepare documentos, acompanhe prazos e analise itens aqui. Propostas e lances são enviados exclusivamente no portal oficial.</span></div><ExternalActions links={officialLinks} compact /></aside>
    <div className="procurement-workspace">
      <nav className="workspace-tabs" role="tablist" aria-label="Áreas da licitação">{sections.map(([id, label, Icon], index) => <button id={`tab-${id}`} role="tab" aria-selected={active === id} aria-controls={`panel-${id}`} tabIndex={active === id ? 0 : -1} onClick={() => select(id)} onKeyDown={(event) => navigate(event, index)} ref={(node) => { tabRefs.current[index] = node; }} key={id}><Icon aria-hidden="true" /><span>{label}</span></button>)}</nav>
      <main className="workspace-content" id={`panel-${active}`} role="tabpanel" aria-labelledby={`tab-${active}`} tabIndex={0}>
        {active === "informacoes" && information}
        {active === "itens" && items}
        {active === "arquivos" && (officialData.available ? <OfficialDocuments records={officialData.documents} warning={officialData.warnings.documents} /> : <OfficialDataUnavailable links={officialLinks} />)}
        {active === "atas" && (officialData.available ? <OfficialMinutes records={officialData.minutes} warning={officialData.warnings.minutes} /> : <OfficialDataUnavailable links={officialLinks} />)}
        {active === "contratos" && (officialData.available ? <OfficialContracts records={officialData.contracts} warning={officialData.warnings.contracts} /> : <OfficialDataUnavailable links={officialLinks} />)}
        {active === "historico" && (officialData.available ? <OfficialHistory records={officialData.history} warning={officialData.warnings.history} /> : <OfficialDataUnavailable links={officialLinks} />)}
        {active === "documentos" && <section className="panel workspace-empty"><ClipboardCheck aria-hidden="true" /><p className="eyebrow">GESTÃO PRIVADA</p><h2>Documentos da sua operação</h2><p>Use o Portal do Cliente para solicitar arquivos, receber anexos e acompanhar pendências sem misturar esses documentos privados com a fonte pública.</p><Link className="button" href="/app/clientes">Abrir Portal do Cliente</Link></section>}
        {active === "mensagens" && <SourceOnlySection title="Mensagens do processo" description="Mensagens oficiais, chats de sessão e convocações permanecem no sistema de compras responsável. A plataforma aponta para a origem e não simula comunicação oficial." links={officialLinks} />}
        {active === "relatorios" && <SourceOnlySection title="Relatórios e atas" description="Relatórios públicos serão exibidos quando a API oficial os disponibilizar. Até lá, consulte o processo no portal responsável." links={officialLinks} />}
        {active === "impugnacoes" && <SourceOnlySection title="Impugnações" description="Controle prazos e prepare sua análise na plataforma; o protocolo deve ser realizado no canal definido pelo edital ou pelo portal oficial." links={officialLinks} />}
        {active === "esclarecimentos" && <SourceOnlySection title="Dúvidas e esclarecimentos" description="Acompanhe o prazo e consulte respostas oficiais na origem. O Nexo Público não envia questionamentos em nome do licitante." links={officialLinks} />}
        {active === "diligencias" && <SourceOnlySection title="Diligências" description="Centralize a preparação dos documentos solicitados, mantendo o atendimento formal no portal ou canal indicado pelo órgão." links={officialLinks} />}
        {active === "notificacoes" && <SourceOnlySection title="Notificações do processo" description="As mudanças capturadas pelas fontes oficiais aparecerão na linha do tempo. Confirmações formais continuam sendo feitas no portal de origem." links={officialLinks} />}
        {active === "regionalidade" && <section className="panel workspace-empty"><MapPinned aria-hidden="true" /><p className="eyebrow">LOCALIZAÇÃO</p><h2>{location || "Localização não informada"}</h2><p>A análise regional será cruzada com histórico de órgãos, fornecedores e preços do mercado analisado. Nenhuma preferência regional é inferida sem dados da fonte.</p></section>}
      </main>
    </div>
  </>;
}
