import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, requireTenantRole } from "@/lib/security";
import { syncPNCP } from "@/services/sync/pncp-sync";

export const maxDuration = 60;

const schema = z.object({
  dataInicial: z.string().regex(/^\d{8}$/),
  dataFinal: z.string().regex(/^\d{8}$/),
  codigoModalidadeContratacao: z.number().int().positive(),
  maxPages: z.number().int().min(1).max(25).default(5),
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await requireTenantRole(["owner", "admin"], request);
    const input = schema.parse(await request.json());
    const result = await syncPNCP(input);
    return NextResponse.json({ data: result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const status = code === "UNAUTHORIZED" || code === "AUTH_NOT_CONFIGURED" ? 401
      : code === "FORBIDDEN" ? 403
      : error instanceof z.ZodError ? 400
      : 500;
    return NextResponse.json({
      message: status === 401 ? "Sessão necessária."
        : status === 403 ? "Apenas administradores podem sincronizar."
        : status === 400 ? "Parâmetros de sincronização inválidos."
        : "A sincronização falhou. Verifique as credenciais administrativas e os logs.",
    }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
