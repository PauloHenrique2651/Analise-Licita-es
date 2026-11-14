"use client";

import { createBrowserClient } from "@supabase/ssr";
import { createLocalBrowserClient } from "@/lib/local-db/browser-client";
import { isLocalBackend } from "@/lib/local-db/mode";
import { supabasePublicConfig } from "@/lib/supabase/public-config";

function createSupabaseBrowserClient() {
  return createBrowserClient(supabasePublicConfig.url, supabasePublicConfig.publishableKey);
}

export function createClient() {
  if (isLocalBackend()) return createLocalBrowserClient() as unknown as ReturnType<typeof createSupabaseBrowserClient>;
  return createSupabaseBrowserClient();
}
