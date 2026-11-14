"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { Brand } from "@/components/brand";
import { ACCOUNT_LINKS, NAV_GROUPS, isActive } from "./navigation";

/** Gaveta de navegação para telas estreitas; no desktop a navegação fica no menu superior. */
export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const sections = [...NAV_GROUPS, { label: "Empresa", items: ACCOUNT_LINKS }];
  return (
    <>
      {open && <button className="sidebar-scrim" aria-label="Fechar menu" onClick={onClose} />}
      <aside className={`sidebar ${open ? "open" : ""}`} aria-hidden={!open}>
        <div className="sidebar-head"><Brand /><button className="icon-button" onClick={onClose} aria-label="Fechar menu"><X aria-hidden="true" /></button></div>
        <nav aria-label="Navegação principal">
          {sections.map((section) => (
            <div className="nav-section" key={section.label}>
              <p>{section.label}</p>
              {section.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(pathname, item.href);
                return <Link key={item.href} href={item.href} onClick={onClose} className={active ? "active" : ""} aria-current={active ? "page" : undefined} tabIndex={open ? undefined : -1}><Icon aria-hidden="true" /><span>{item.label}</span></Link>;
              })}
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
