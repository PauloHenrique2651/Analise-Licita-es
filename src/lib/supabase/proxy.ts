import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isLocalBackend } from "@/lib/local-db/mode";
import { LOCAL_SESSION_COOKIE, verifyLocalToken } from "@/lib/local-db/session";
import { supabasePublicConfig } from "@/lib/supabase/public-config";

const protectedPrefixes = ["/app", "/api/analytics", "/api/companies", "/api/sync"];

function redirectBySession(request: NextRequest, hasUser: boolean, response: NextResponse) {
  const isProtected = protectedPrefixes.some((prefix) => request.nextUrl.pathname.startsWith(prefix));
  if (!hasUser && isProtected) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    return NextResponse.redirect(login);
  }
  if (hasUser && request.nextUrl.pathname === "/login") {
    const market = request.nextUrl.clone();
    market.pathname = "/app/mercado";
    return NextResponse.redirect(market);
  }
  return response;
}

export async function updateSession(request: NextRequest) {
  if (isLocalBackend()) {
    const hasUser = Boolean(verifyLocalToken(request.cookies.get(LOCAL_SESSION_COOKIE)?.value));
    return redirectBySession(request, hasUser, NextResponse.next({ request }));
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(supabasePublicConfig.url, supabasePublicConfig.publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(items) {
        items.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        items.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();
  return redirectBySession(request, Boolean(user), response);
}
