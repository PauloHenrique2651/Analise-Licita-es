import type { NextRequest } from "next/server";
import type { QueryDescriptor } from "@/lib/local-db/query-builder";
import { localClientForRequest, localOnly } from "@/lib/local-db/route-helpers";
import { runQuery } from "@/lib/local-db/engine";
import { verifyLocalToken, LOCAL_SESSION_COOKIE } from "@/lib/local-db/session";

// Equivalente local do PostgREST para o navegador. Executa como anon/authenticated (nunca service_role),
// então o RLS das migrações continua valendo.
export async function POST(request: NextRequest) {
  const blocked = localOnly();
  if (blocked) return blocked;
  const { respond } = localClientForRequest(request);
  const descriptor = (await request.json()) as QueryDescriptor;
  const payload = verifyLocalToken(request.cookies.get(LOCAL_SESSION_COOKIE)?.value);
  const result = await runQuery(descriptor, payload
    ? { role: "authenticated", userId: payload.sub, email: payload.email }
    : { role: "anon" });
  return respond(result, { status: result.error ? result.status : 200 });
}
