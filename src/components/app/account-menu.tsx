"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, CircleUserRound, LoaderCircle, LogOut, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ACCOUNT_LINKS } from "./navigation";

type Account = { name: string; email: string; initials: string };

function accountFromUser(user: { email?: string; user_metadata?: Record<string, unknown> } | null): Account {
  const email = user?.email ?? "";
  const name = typeof user?.user_metadata?.display_name === "string" && user.user_metadata.display_name.trim()
    ? user.user_metadata.display_name.trim()
    : email.split("@")[0] || "Minha conta";
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "?";
  return { name, email, initials };
}

export function AccountMenu() {
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [account, setAccount] = useState<Account>({ name: "Minha conta", email: "", initials: "?" });

  useEffect(() => {
    const client = createClient();
    void client.auth.getUser().then(({ data }) => setAccount(accountFromUser(data.user)));
    const { data: listener } = client.auth.onAuthStateChange((_event, session) => setAccount(accountFromUser(session?.user ?? null)));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    function closeOnOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutside);
    return () => document.removeEventListener("mousedown", closeOnOutside);
  }, []);

  async function signOut() {
    setPending(true);
    await createClient().auth.signOut({ scope: "local" });
    router.replace("/login");
    router.refresh();
  }

  return <div className="account-menu" ref={menuRef}>
    <button className="account-trigger" type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-haspopup="menu" aria-label="Abrir menu da conta">
      <span className="avatar" aria-hidden="true">{account.initials}</span><ChevronDown aria-hidden="true" />
    </button>
    {open && <div className="account-popover" role="menu" aria-label="Menu da conta">
      <div className="account-summary"><span className="account-summary-avatar"><UserRound aria-hidden="true" /></span><div><strong>{account.name}</strong><small>{account.email || "Carregando acesso…"}</small></div></div>
      <div className="account-menu-links"><Link href="/app/perfil" role="menuitem" onClick={() => setOpen(false)}><CircleUserRound aria-hidden="true" />Meu perfil</Link>{ACCOUNT_LINKS.map((item) => { const Icon = item.icon; return <Link key={item.href} href={item.href} role="menuitem" onClick={() => setOpen(false)}><Icon aria-hidden="true" />{item.label}</Link>; })}</div>
      <button className="account-signout" type="button" onClick={signOut} disabled={pending}>{pending ? <LoaderCircle className="spin" aria-hidden="true" /> : <LogOut aria-hidden="true" />}{pending ? "Saindo…" : "Sair da conta"}</button>
    </div>}
  </div>;
}
