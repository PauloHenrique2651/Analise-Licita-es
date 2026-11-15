import { ManagementWorkspace } from "@/components/management/management-workspace";
import { getManagementWorkspace } from "@/services/management-service";

export const dynamic = "force-dynamic";

export default async function FunnelPage() {
  const workspace = await getManagementWorkspace();
  return <ManagementWorkspace mode="funnel" initialOpportunities={workspace.opportunities} initialEvents={workspace.events} />;
}
