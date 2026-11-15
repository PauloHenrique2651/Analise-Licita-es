import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, requireTenantRole } from "@/lib/security";

const paramsSchema = z.object({ shareId: z.string().uuid(), requestId: z.string().uuid() });
const bodySchema = z.object({ status: z.enum(["accepted", "rejected"]) });

/** A equipe aceita ou recusa o arquivo recebido. Recusado volta a pedir envio ao cliente. */
export async function PATCH(request: Request, { params }: { params: Promise<{ shareId: string; requestId: string }> }) {
  try {
    assertSameOrigin(request);
    const { shareId, requestId } = paramsSchema.parse(await params);
    const { status } = bodySchema.parse(await request.json());
    const { supabase } = await requireTenantRole(["owner", "admin", "analyst", "sales"], request);
    const { data, error } = await supabase.from("document_requests").update({ status, updated_at: new Date().toISOString() }).eq("id", requestId).eq("share_id", shareId).select("id");
    if (error) throw error;
    if (!data?.length) return NextResponse.json({ message: "Solicitação não encontrada." }, { status: 404 });
    return NextResponse.json({ data: { status } });
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : error instanceof Error && ["UNAUTHORIZED", "FORBIDDEN", "TENANT_NOT_FOUND", "INVALID_ORIGIN"].includes(error.message) ? 403 : 500;
    return NextResponse.json({ message: status === 403 ? "Você não tem permissão para alterar esta solicitação." : status === 400 ? "Status inválido." : "Não foi possível atualizar a solicitação." }, { status });
  }
}
