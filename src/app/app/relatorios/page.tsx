import type { Metadata } from "next";
import { CalendarRange, Coins, FileText, MapPin, PackageSearch, Scale } from "lucide-react";
import { ReportDialog } from "@/components/reports/report-dialog";

export const metadata: Metadata = { title: "Relatório gerencial" };

const questions = [
  { icon: PackageSearch, color: "coral", title: "O quê?", text: "Categorias e produtos que mais aparecem nas licitações, e onde está o dinheiro por categoria." },
  { icon: CalendarRange, color: "amber", title: "Quando?", text: "Evolução mês a mês, mês de pico, prazo médio entre a publicação e a proposta." },
  { icon: Coins, color: "teal", title: "Quanto?", text: "Valor movimentado, mediana, faixas de valor e as maiores licitações do período." },
  { icon: MapPin, color: "blue", title: "Onde?", text: "Ranking de municípios e de órgãos compradores, com a participação de cada um." },
  { icon: Scale, color: "violet", title: "De que forma?", text: "Modalidades, modo de disputa, benefícios para ME/EPP e portais usados." },
] as const;

export default function ReportsPage() {
  return <>
    <header className="page-header">
      <div><p className="eyebrow">ANÁLISE</p><h1>Relatório gerencial</h1><p>Escolha os municípios e o período e baixe um PDF com gráficos e leituras sobre as condições comerciais da região.</p></div>
      <ReportDialog />
    </header>

    <section className="report-hero panel">
      <div className="report-hero-icon"><FileText aria-hidden="true" /></div>
      <div>
        <h2>Um relatório pronto para reunião</h2>
        <p>O sistema reúne as licitações dos municípios escolhidos e responde às perguntas principais da análise comercial. O PDF vem com capa, resumo executivo, gráficos coloridos, rankings, considerações para quem vende para a região e a metodologia.</p>
        <div className="report-hero-actions"><ReportDialog label="Escolher municípios e gerar" /></div>
      </div>
    </section>

    <section className="report-questions" aria-label="O que o relatório responde">
      {questions.map((item) => <article className={`panel report-question ${item.color}`} key={item.title}><item.icon aria-hidden="true" /><h3>{item.title}</h3><p>{item.text}</p></article>)}
    </section>
    <p className="muted report-note">Valores usam o homologado quando existe, senão o estimado. Valores a partir de R$ 200 milhões por contratação são tratados como atípicos (quase sempre erro de digitação) e ficam fora dos valores, mas aparecem contados no relatório.</p>
  </>;
}
