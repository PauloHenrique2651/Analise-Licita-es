import { FileKey2, FilePlus2, KeyRound, LockKeyhole, ReceiptText, ServerCog } from "lucide-react";

export const metadata = { title: "Emissão fiscal" };

export default function FiscalPage() {
  return <>
    <header className="page-header"><div><p className="eyebrow">GESTÃO FISCAL</p><h1>Notas fiscais</h1><p>Certificados A1, emissão de NF-e e documentos fiscais por empresa autorizada.</p></div><button className="button primary" disabled title="Disponível após homologação do worker fiscal"><FilePlus2 aria-hidden="true" />Nova NF-e</button></header>
    <div className="data-notice"><LockKeyhole aria-hidden="true" /><span><strong>Módulo em preparação segura</strong>A emissão real ficará bloqueada até homologação SEFAZ, configuração do worker fiscal e cofre de chaves. Certificados e senhas nunca serão armazenados em texto puro.</span></div>
    <section className="portal-feature-grid">
      <article className="panel feature-card"><div><FileKey2 aria-hidden="true" /></div><h2>Certificados A1</h2><p>Upload direto ao cofre, criptografia por envelope, expiração monitorada e acesso isolado por tenant.</p></article>
      <article className="panel feature-card"><div><KeyRound aria-hidden="true" /></div><h2>Autorização do cliente</h2><p>Mandato explícito, escopo de emissão, responsável, validade e revogação registrados.</p></article>
      <article className="panel feature-card"><div><ReceiptText aria-hidden="true" /></div><h2>NF-e e DANFE</h2><p>Fila de emissão, validação de schema, resposta SEFAZ, XML e DANFE com rastreabilidade.</p></article>
      <article className="panel feature-card"><div><ServerCog aria-hidden="true" /></div><h2>Worker fiscal</h2><p>Processamento isolado do frontend Vercel, com segredos somente no servidor e logs sem conteúdo sensível.</p></article>
    </section>
    <section className="panel portal-list"><div className="panel-head"><div><p className="panel-title">Emissões recentes</p><small>Ambiente de homologação e produção</small></div></div><div className="empty-inline tall"><ReceiptText aria-hidden="true" /><span>Nenhuma nota emitida.</span></div></section>
  </>;
}
