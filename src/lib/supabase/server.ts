import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { isLocalBackend } from "@/lib/local-db/mode";
import { createLocalServerClient } from "@/lib/local-db/server-client";
import { supabasePublicConfig } from "@/lib/supabase/public-config";

type CookieStore = Awaited<ReturnType<typeof cookies>>;

function createSupabaseServerClient(cookieStore: CookieStore) {
  return createServerClient(
    supabasePublicConfig.url,
    supabasePublicConfig.publishableKey,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (items) => {
          try {
            items.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Server Components não podem gravar cookies; o proxy renova a sessão.
          }
        },
      },
    },
  );
}

type SupabaseServerClient = ReturnType<typeof createSupabaseServerClient>;

export async function createClient() {
  const cookieStore = await cookies();

  if (isLocalBackend()) {
    return createLocalServerClient({
      cookies: {
        get: (name) => cookieStore.get(name)?.value,
        set: (name, value, options) => {
          try {
            cookieStore.set(name, value, options);
          } catch {
            // Server Components não podem gravar cookies; rotas e Server Actions podem.
          }
        },
      },
    }) as unknown as SupabaseServerClient;
  }

  return createSupabaseServerClient(cookieStore);
}
