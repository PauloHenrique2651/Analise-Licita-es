import { NextResponse } from "next/server";
import { z } from "zod";
import { assertInternalSyncAuth } from "@/lib/internal-auth";
import { syncPNCP } from "@/services/sync/pncp-sync";

export const maxDuration = 60;

const optionalSchema = z.object({ maxPages: z.number().int().min(1).max(10).default(2) });

function compactDate(date: Date) {
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}`;
}

export async function POST(request: Request) {
  try {
    assertInternalSyncAuth(request);
    const input = optionalSchema.parse(await request.json().catch(() => ({})));
    const end = new Date();
    const start = new Date(end.getTime() - 2 * 86_400_000);
    const data = await syncPNCP({
      dataInicial: compactDate(start),
      dataFinal: compactDate(end),
      codigoModalidadeContratacao: 6,
      maxPages: input.maxPages,
    });
    return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const unauthorized = error instanceof Error && error.message === "UNAUTHORIZED";
    return NextResponse.json({ message: unauthorized ? "Não autorizado." : "Sincronização PNCP falhou." }, { status: unauthorized ? 401 : 502 });
  }
}
