"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { NAV_GROUPS, isActive } from "./navigation";

/** Menu superior com grupos suspensos. Abre por clique, toque ou teclado; no mouse também abre ao passar. */
export function TopNav() {
  const pathname = usePathname();
  const baseId = useId();
  const [open, setOpen] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const hoverTimer = useRef<number | null>(null);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (navRef.current && !navRef.current.contains(event.target as Node)) setOpen(null);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(null);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onPointerDown); document.removeEventListener("keydown", onKey); };
  }, []);

  function hover(label: string | null) {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => setOpen(label), label ? 80 : 160);
  }

  return (
    <nav className="top-nav" aria-label="Navegação principal" ref={navRef}>
      <ul>
        {NAV_GROUPS.map((group, index) => {
          const groupActive = group.items.some((item) => isActive(pathname, item.href));
          const expanded = open === group.label;
          const panelId = `${baseId}-menu-${index}`;
          return (
            <li
              key={group.label}
              className={`top-nav-group${groupActive ? " active" : ""}${expanded ? " open" : ""}`}
              onPointerEnter={(event) => { if (event.pointerType === "mouse") hover(group.label); }}
              onPointerLeave={(event) => { if (event.pointerType === "mouse") hover(null); }}
            >
              <button type="button" aria-expanded={expanded} aria-controls={panelId} onClick={() => setOpen(expanded ? null : group.label)}>
                {group.label}<ChevronDown aria-hidden="true" />
              </button>
              <div className="top-nav-menu" id={panelId} hidden={!expanded}>
                <ul className={group.items.length > 5 ? "two-columns" : undefined}>
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const current = isActive(pathname, item.href);
                    return (
                      <li key={item.href}>
                        <Link href={item.href} onClick={() => setOpen(null)} className={current ? "current" : undefined} aria-current={current ? "page" : undefined}>
                          <Icon aria-hidden="true" />
                          <span><strong>{item.label}</strong><small>{item.description}</small></span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
