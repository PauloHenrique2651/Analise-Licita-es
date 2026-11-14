import type { NextRequest } from "next/server";
import { localClientForRequest, localOnly } from "@/lib/local-db/route-helpers";

const ALLOWED = new Set(["getUser", "getSession", "signInWithPassword", "signUp", "signOut", "updateUser", "resetPasswordForEmail"]);

function serializeError(error: unknown) {
  if (!error) return null;
  const value = error as { message?: string; status?: number; code?: string };
  return { message: value.message ?? "Erro de autenticação.", status: value.status, code: value.code };
}

export async function POST(request: NextRequest) {
  const blocked = localOnly();
  if (blocked) return blocked;
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.headers.get("host")) {
    return Response.json({ data: {}, error: { message: "Origem inválida.", status: 403 } }, { status: 403 });
  }
  const { action, payload } = (await request.json()) as { action: string; payload?: Record<string, unknown> };
  if (!ALLOWED.has(action)) return Response.json({ data: {}, error: { message: "Ação inválida.", status: 400 } }, { status: 400 });

  const { client, respond } = localClientForRequest(request);
  const auth = client.auth;
  let result: { data: unknown; error: unknown };
  switch (action) {
    case "getUser": result = await auth.getUser(); break;
    case "getSession": result = await auth.getSession(); break;
    case "signInWithPassword": result = await auth.signInWithPassword(payload as { email: string; password: string }); break;
    case "signUp": result = await auth.signUp(payload as { email: string; password: string; options?: { data?: Record<string, unknown> } }); break;
    case "signOut": result = { data: {}, ...(await auth.signOut()) }; break;
    case "updateUser": result = await auth.updateUser(payload as { password?: string; data?: Record<string, unknown> }); break;
    default: {
      const input = payload as { email: string; options?: { redirectTo?: string } };
      result = await auth.resetPasswordForEmail(input.email, input.options);
    }
  }
  return respond({ data: result.data, error: serializeError(result.error) });
}
