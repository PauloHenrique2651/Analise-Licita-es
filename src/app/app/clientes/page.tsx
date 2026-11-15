import { PortalManager, type Share } from "@/components/portal/portal-manager";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Portal do cliente" };
export const dynamic = "force-dynamic";

export default async function ClientPortalPage() {
  const supabase = await createClient();
  // Só os links da empresa ativa (RLS). A lista de processos não é carregada aqui: a busca é feita sob demanda.
  const { data: shareRows } = supabase
    ? await supabase
      .from("client_portal_shares")
      .select("id, client_name, client_email, expires_at, last_accessed_at, created_at, procurements(control_number, object_description)")
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(100)
    : { data: [] };

  const shares: Share[] = (shareRows ?? []).map((row) => {
    const procurement = Array.isArray(row.procurements) ? row.procurements[0] : row.procurements;
    return {
      id: row.id,
      clientName: row.client_name,
      clientEmail: row.client_email ?? null,
      expiresAt: row.expires_at,
      lastAccessedAt: row.last_accessed_at ?? null,
      controlNumber: procurement?.control_number ?? "Processo compartilhado",
      object: procurement?.object_description ?? "",
    };
  });

  return <PortalManager initialShares={shares} />;
}
