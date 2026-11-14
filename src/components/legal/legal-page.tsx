import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Brand } from "@/components/brand";
import { CookiePreferencesButton } from "./cookie-consent";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <main className="legal-page">
      <header><Link href="/login" className="legal-back"><ArrowLeft aria-hidden="true" />Voltar</Link><Brand /></header>
      <article>
        <h1>{title}</h1>
        <p className="legal-updated">Atualizada em {updated}</p>
        {children}
      </article>
      <footer><Link href="/politica-de-privacidade">Privacidade</Link><Link href="/politica-de-cookies">Cookies</Link><CookiePreferencesButton /></footer>
    </main>
  );
}
