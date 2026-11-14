"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { Bell, Bot, Menu, Search } from "lucide-react";
import { Brand } from "@/components/brand";
import { ProcurementDrawer } from "@/components/procurement/procurement-drawer";
import { AccountMenu } from "./account-menu";
import { AssistantPanel } from "./assistant-panel";
import { Sidebar } from "./sidebar";
import { TopNav } from "./top-nav";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  return (
    <div className="app-shell top-layout">
      <a className="skip-link" href="#conteudo-principal">Ir para o conteúdo principal</a>
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
      <header className="topbar">
        <div className="topbar-inner">
          <button className="icon-button mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Abrir menu" aria-expanded={menuOpen}><Menu aria-hidden="true" /></button>
          <Link href="/app/hoje" className="topbar-brand" aria-label="Nexo Público, ir para Hoje"><Brand /></Link>
          <TopNav />
          <form className="global-search" action="/app/pesquisa" method="get" role="search">
            <Search aria-hidden="true" />
            <label className="sr-only" htmlFor="global-search-input">Busca global</label>
            <input id="global-search-input" name="q" type="search" placeholder="Buscar produto, órgão, CNPJ ou processo" />
          </form>
          <div className="topbar-actions">
            <button className="icon-button" type="button" onClick={() => setAssistantOpen(true)} aria-label="Abrir assistente" title="Assistente"><Bot aria-hidden="true" /></button>
            <button className="icon-button" type="button" aria-label="Notificações"><Bell aria-hidden="true" /></button>
            <AccountMenu />
          </div>
        </div>
      </header>
      <main id="conteudo-principal" className="page-content">{children}</main>
      <Suspense fallback={null}><ProcurementDrawer /></Suspense>
      <AssistantPanel open={assistantOpen} onClose={() => setAssistantOpen(false)} />
    </div>
  );
}
