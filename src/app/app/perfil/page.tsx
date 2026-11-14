import { redirect } from "next/navigation";
import { ProfileSettings } from "@/components/profile/profile-settings";
import { createClient } from "@/lib/supabase/server";

export default async function ProfilePage() {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await client.from("users").select("display_name").eq("id", user.id).maybeSingle();
  const metadataName = typeof user.user_metadata.display_name === "string" ? user.user_metadata.display_name : "";
  const initialName = profile?.display_name || metadataName || user.email?.split("@")[0] || "";
  return <><header className="page-header"><div><p className="eyebrow">CONTA</p><h1>Perfil e segurança</h1><p>Gerencie sua identificação, senha e o acesso ao ambiente.</p></div></header><ProfileSettings initialName={initialName} email={user.email ?? ""} /></>;
}
