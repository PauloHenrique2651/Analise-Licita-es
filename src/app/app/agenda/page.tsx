import { AgendaWorkspace } from "@/components/agenda/agenda-workspace";
import { getAgendaItems } from "@/services/agenda-service";

export const dynamic = "force-dynamic";

export default async function AgendaPage() {
  return <AgendaWorkspace items={await getAgendaItems()} asOf={new Date().toISOString()} />;
}
