import { ManagementWorkspace } from "@/components/management/management-workspace";
import { getManagementWorkspace } from "@/services/management-service";

export const dynamic = "force-dynamic";

export default async function ChecklistPage() {
  const workspace = await getManagementWorkspace();
  return <ManagementWorkspace mode="checklist" initialOpportunities={workspace.opportunities} procurements={workspace.procurements} initialEvents={workspace.events} />;
}
