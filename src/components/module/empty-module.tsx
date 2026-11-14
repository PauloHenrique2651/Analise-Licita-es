import { ArrowRight, Database, Search } from "lucide-react";
import Link from "next/link";

type ModuleProps = { title: string; description: string; search?: string; label?: string };

export function EmptyModule({ title, description, search, label = "ANÁLISE" }: ModuleProps) {
  return (
    <>
      <header className="page-header"><div><p className="eyebrow">{label}</p><h1>{title}</h1><p>{description}</p></div></header>
      {search && <div className="module-search"><Search aria-hidden="true" /><label className="sr-only" htmlFor="module-search">Pesquisar</label><input id="module-search" type="search" placeholder={search} /><button className="button primary">Pesquisar</button></div>}
      <section className="panel module-empty"><div className="module-empty-icon"><Database aria-hidden="true" /></div><h2>Aguardando dados da sincronização</h2><p>Os resultados aparecerão aqui somente depois que forem importados de uma fonte oficial e normalizados. Nenhuma informação fictícia é exibida.</p><Link className="button secondary" href="/app/admin">Ver integrações <ArrowRight aria-hidden="true" /></Link></section>
    </>
  );
}
