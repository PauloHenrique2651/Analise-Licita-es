import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { isLocalBackend } from "@/lib/local-db/mode";
import { createLocalServerClient, type CookieAdapter } from "@/lib/local-db/server-client";

type PendingCookie = { name: string; value: string; options: Parameters<CookieAdapter["set"]>[2] };

/** Cliente local ligado aos cookies da requisição; os cookies gravados são aplicados na resposta. */
export function localClientForRequest(request: NextRequest) {
  const pending: PendingCookie[] = [];
  const client = createLocalServerClient({
    clientIp: request.headers.get("x-real-ip"),
    cookies: {
      get: (name) => request.cookies.get(name)?.value,
      set: (name, value, options) => { pending.push({ name, value, options }); },
    },
  });
  function respond(body: unknown, init?: ResponseInit) {
    const response = NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...init?.headers } });
    for (const cookie of pending) response.cookies.set(cookie.name, cookie.value, cookie.options);
    return response;
  }
  return { client, respond };
}

export function localOnly() {
  return isLocalBackend() ? null : NextResponse.json({ message: "Não encontrado." }, { status: 404 });
}
