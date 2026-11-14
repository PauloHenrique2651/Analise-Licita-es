"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCcw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function SyncButton() {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function sync() {
    setPending(true);
    setStatus(null);
    const end = new Date();
    const start = new Date(end.getTime() - 7 * 86_400_000);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setStatus("Sua sessão expirou. Redirecionando para o login…");
        router.replace("/login?next=/app/admin");
        return;
      }
      const response = await fetch("/api/sync/procurements", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          startDate: isoDay(start),
          endDate: isoDay(end),
          modalityCode: 6,
        }),
      });
      const payload = await response.json() as { data?: { results: Array<{ processed: number; errors: number; provider: string; status: string }>; homologations?: { inserted: number; updated: number; deferred: number } }; message?: string };
      if (response.status === 401) {
        setStatus("Sua sessão expirou. Redirecionando para o login…");
        router.replace("/login?next=/app/admin");
        return;
      }
      if (!response.ok) throw new Error(payload.message ?? "Sincronização indisponível.");
      const results = payload.data?.results ?? [];
      const homologations = payload.data?.homologations;
      const summary = results.map((result) => `${result.provider}: ${result.processed} processos (${result.status})`);
      if (homologations) summary.push(`${homologations.inserted + homologations.updated} resultados homologados atualizados`);
      setStatus(summary.join(" · "));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Sincronização indisponível.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="sync-action">
      <span className="status-badge"><RefreshCcw aria-hidden="true" />Automático · 5 min</span>
      <button className="button secondary" disabled={pending} onClick={sync} type="button">
        <RefreshCcw className={pending ? "spin" : ""} aria-hidden="true" />
        {pending ? "Sincronizando…" : "Sincronizar fontes oficiais"}
      </button>
      {status && <small role="status">{status}</small>}
    </div>
  );
}
