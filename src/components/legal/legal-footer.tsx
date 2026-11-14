"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CookiePreferencesButton } from "./cookie-consent";

export function LegalLinks() {
  return (
    <nav className="legal-links" aria-label="Informações legais">
      <Link href="/politica-de-privacidade">Privacidade</Link>
      <Link href="/politica-de-cookies">Cookies</Link>
      <CookiePreferencesButton />
    </nav>
  );
}

/** Rodapé das páginas públicas; dentro de /app o rodapé é renderizado pelo próprio layout do app. */
export function PublicLegalFooter() {
  const pathname = usePathname();
  if (pathname.startsWith("/app") || pathname.startsWith("/politica-")) return null;
  return <footer className="public-legal-footer"><LegalLinks /></footer>;
}
