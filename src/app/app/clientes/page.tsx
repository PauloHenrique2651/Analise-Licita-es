import { PortalManager } from "@/components/portal/portal-manager";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Portal do cliente" };
export const dynamic = "force-dynamic";

export default async function ClientPortalPage() {
  const supabase = await createClient();
  const [{ data: procurementRows }, { data: shareRows }] = supabase ? await Promise.all([
    supabase.from("procurements").select("id, control_number, object_description").order("published_at", { ascending: false }).limit(100),
    supabase.from("client_portal_shares").select("id, client_name, expires_at, procurements(control_number)").is("revoked_at", null).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(50),
  ]) : [{ data: [] }, { data: [] }];

  const procurements = (procurementRows ?? []).map((row) => ({
    id: row.id,
    label: `${row.control_number} — ${row.object_description}`.slice(0, 180),
  }));
  const shares = (shareRows ?? []).map((row) => {
    const procurement = Array.isArray(row.procurements) ? row.procurements[0] : row.procurements;
    return {
      id: row.id,
      clientName: row.client_name,
      expiresAt: row.expires_at,
      procurementLabel: procurement?.control_number ?? "Processo compartilhado",
    };
  });

  return <PortalManager procurements={procurements} initialShares={shares} />;
}
