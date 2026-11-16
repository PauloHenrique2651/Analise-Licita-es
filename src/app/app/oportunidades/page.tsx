import { ManagementWorkspace } from "@/components/management/management-workspace";
import { getManagementWorkspace } from "@/services/management-service";

export const dynamic = "force-dynamic";

export default async function OpportunitiesPage() {
  const workspace = await getManagementWorkspace();
  return <ManagementWorkspace mode="opportunities" initialOpportunities={workspace.opportunities} initialEvents={workspace.events} companies={workspace.companies} />;
}
