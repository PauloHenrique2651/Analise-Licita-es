import "server-only";
import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import type { PortalSnapshot } from "@/types/portal";

export function portalTokenHash(token: string) {
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) return null;
  return createHash("sha256").update(token).digest("hex");
}

export async function getPortalSnapshot(token: string): Promise<PortalSnapshot | null> {
  const tokenHash = portalTokenHash(token);
  if (!tokenHash) return null;
  const supabase = await createClient();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("get_public_portal_snapshot", { p_token_hash: tokenHash });
  if (error || !data) return null;
  return data as PortalSnapshot;
}
