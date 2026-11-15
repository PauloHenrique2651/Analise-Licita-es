import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isLocalBackend } from "@/lib/local-db/mode";
import { createLocalServerClient } from "@/lib/local-db/server-client";
import { assertSameOrigin } from "@/lib/security";
import { supabasePublicConfig } from "@/lib/supabase/public-config";

const loginSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(6).max(128),
});

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const input = loginSchema.parse(await request.json());
    const response = NextResponse.json({ authenticated: true }, {
      headers: { "Cache-Control": "no-store" },
    });
    if (isLocalBackend()) {
      const local = createLocalServerClient({
        clientIp: request.headers.get("x-real-ip"),
        cookies: {
          get: (name) => request.cookies.get(name)?.value,
          set: (name, value, options) => { response.cookies.set(name, value, options); },
        },
      });
      const { error } = await local.auth.signInWithPassword(input);
      if (error && (error as { status?: number }).status === 429) {
        return NextResponse.json({ message: error.message }, { status: 429, headers: { "Cache-Control": "no-store" } });
      }
      if (error) {
        return NextResponse.json({ message: "E-mail ou senha inválidos." }, { status: 401, headers: { "Cache-Control": "no-store" } });
      }
      return response;
    }
    const supabase = createServerClient(
      supabasePublicConfig.url,
      supabasePublicConfig.publishableKey,
      {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: (items) => items.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
        },
      },
    );
    const { error } = await supabase.auth.signInWithPassword(input);
    if (error) {
      console.warn("Login rejected", {
        project: new URL(supabasePublicConfig.url).hostname,
        code: error.code,
        status: error.status,
        message: error.message,
      });
      const unavailable = error.status === 0;
      return NextResponse.json({
        message: unavailable ? "O serviço de acesso está temporariamente indisponível. Tente novamente." : "E-mail ou senha inválidos.",
      }, {
        status: unavailable ? 502 : 401,
        headers: { "Cache-Control": "no-store" },
      });
    }
    return response;
  } catch (error) {
    return NextResponse.json({
      message: error instanceof z.ZodError ? "Dados de acesso inválidos." : "Não foi possível iniciar a sessão.",
    }, {
      status: error instanceof z.ZodError ? 400 : 403,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
