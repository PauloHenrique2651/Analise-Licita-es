import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, requireTenantRole } from "@/lib/security";
import { syncProcurements } from "@/services/procurement-sync-service";
import { syncProcurementResults } from "@/services/procurement-results-sync-service";

export const maxDuration = 60;

const schema = z.object({
  startDate: z.iso.date(),
  endDate: z.iso.date(),
  modalityCode: z.number().int().positive().default(6),
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await requireTenantRole(["owner", "admin"], request);
    const input = schema.parse(await request.json());
    const result = await syncProcurements({
      ...input,
      maxPages: 1,
      pageSize: 10,
      withItems: false,
      refreshAnalytics: false,
    });
    const homologations = await syncProcurementResults({
      startDate: new Date(new Date(input.endDate).getTime() - 30 * 86_400_000).toISOString().slice(0, 10),
      endDate: input.endDate,
      maxPages: 1,
      pageSize: 25,
      hydrateMissingLimit: 3,
      refreshAnalytics: true,
    });
    return NextResponse.json({ data: { ...result, homologations } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const status = code === "UNAUTHORIZED" || code === "AUTH_NOT_CONFIGURED" ? 401
      : code === "FORBIDDEN" ? 403
      : error instanceof z.ZodError ? 400 : 502;
    return NextResponse.json({
      message: status === 401 ? "Sessão necessária."
        : status === 403 ? "Apenas administradores podem sincronizar."
        : status === 400 ? "Parâmetros inválidos."
        : "As fontes oficiais estão indisponíveis ou demoraram além do limite. A rotina automática tentará novamente.",
    }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
