import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { isLocalBackend } from "@/lib/local-db/mode";
import { createLocalServerClient } from "@/lib/local-db/server-client";

function createSupabaseAdminClient(url: string, key: string) {
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export function createAdminClient() {
  if (isLocalBackend()) return createLocalServerClient({ admin: true }) as unknown as ReturnType<typeof createSupabaseAdminClient>;
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
    throw new Error("Credenciais administrativas do Supabase não configuradas.");
  }
  return createSupabaseAdminClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY);
}
