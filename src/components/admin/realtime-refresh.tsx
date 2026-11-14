"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Radio } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function RealtimeRefresh() {
  const router = useRouter();
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel("admin-sync-status")
      .on("postgres_changes", { event: "*", schema: "public", table: "imports" }, () => router.refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "sync_logs" }, () => router.refresh())
      .subscribe((status) => setConnected(status === "SUBSCRIBED"));
    return () => { void supabase.removeChannel(channel); };
  }, [router]);
  return <div className={connected ? "live-sync-banner connected" : "live-sync-banner"}><Radio aria-hidden="true" /><span><strong>{connected ? "Painel conectado" : "Conectando às atualizações"}</strong><small>Os indicadores são renovados automaticamente ao final de cada ciclo.</small></span></div>;
}
