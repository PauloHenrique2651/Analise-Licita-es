import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { isLocalBackend } from "@/lib/local-db/mode";
import { createLocalServerClient } from "@/lib/local-db/server-client";

function bearerToken(request?: Request) {
  const authorization = request?.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice(7).trim();
  return token.length > 20 ? token : null;
}

export async function requireUser(request?: Request) {
  const token = bearerToken(request);
  if (token && isLocalBackend()) {
    const supabase = createLocalServerClient({ accessToken: token }) as unknown as Awaited<ReturnType<typeof createClient>>;
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) throw new Error("UNAUTHORIZED");
    return { supabase, user };
  }
  if (token && env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    const supabase = createSupabaseClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { autoRefreshToken: false, persistSession: false },
      },
    );
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) throw new Error("UNAUTHORIZED");
    return { supabase, user };
  }
  const supabase = await createClient();
  if (!supabase) throw new Error("AUTH_NOT_CONFIGURED");
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error("UNAUTHORIZED");
  return { supabase, user };
}

export async function requireTenantRole(allowedRoles: Array<"owner" | "admin" | "analyst" | "sales" | "viewer">, request?: Request) {
  const context = await requireUser(request);
  const { data: profile, error: profileError } = await context.supabase
    .from("users")
    .select("active_tenant_id")
    .eq("id", context.user.id)
    .single();

  if (profileError || !profile?.active_tenant_id) throw new Error("TENANT_NOT_FOUND");

  const { data: membership, error: membershipError } = await context.supabase
    .from("tenant_members")
    .select("role")
    .eq("tenant_id", profile.active_tenant_id)
    .eq("user_id", context.user.id)
    .single();

  if (membershipError || !membership || !allowedRoles.includes(membership.role)) {
    throw new Error("FORBIDDEN");
  }

  return { ...context, tenantId: profile.active_tenant_id, role: membership.role };
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) throw new Error("INVALID_ORIGIN");
  const parsed = new URL(origin);
  if (parsed.host !== host) throw new Error("INVALID_ORIGIN");
}
