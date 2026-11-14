import { notFound } from "next/navigation";
import { Clock3 } from "lucide-react";
import { Brand } from "@/components/brand";
import { PortalLive } from "@/components/portal/portal-live";
import { getPortalSnapshot } from "@/services/portal-service";

export const dynamic = "force-dynamic";

export default async function PublicPortal({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const snapshot = await getPortalSnapshot(token);
  if (!snapshot) notFound();

  return (
    <main className="public-portal">
      <header className="public-header">
        <Brand />
        <span className="status-badge"><Clock3 aria-hidden="true" />Acesso temporário</span>
      </header>
      <PortalLive token={token} initialData={snapshot} />
    </main>
  );
}
