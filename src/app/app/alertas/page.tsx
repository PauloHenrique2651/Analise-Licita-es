import { AlertsWorkspace } from "@/components/alerts/alerts-workspace";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  const supabase = await createClient();
  const { data } = supabase ? await supabase.from("alerts").select("id,name,alert_type,filters,enabled,created_at").order("created_at", { ascending: false }).limit(100) : { data: [] };
  const alerts = (data ?? []).map((alert) => ({ id: alert.id, name: alert.name, alertType: alert.alert_type, filters: (alert.filters ?? {}) as Record<string, unknown>, enabled: alert.enabled, createdAt: alert.created_at }));
  return <AlertsWorkspace initialAlerts={alerts} />;
}
