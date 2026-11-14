import { notFound } from "next/navigation";
import { CompetitorProfile } from "@/components/competitors/competitor-profile";
import { getCompetitorProfile } from "@/services/competitor-service";

export const dynamic = "force-dynamic";

export default async function CompetitorPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await getCompetitorProfile((await params).id);
  if (!profile) notFound();
  return <CompetitorProfile profile={profile} />;
}
