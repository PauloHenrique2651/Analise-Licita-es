import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, requireTenantRole } from "@/lib/security";

const schema = z.object({
  title: z.string().trim().min(2).max(180),
  description: z.string().trim().max(1000).optional(),
  dueAt: z.string().datetime().optional(),
  allowedMimeTypes: z.array(z.enum(["application/pdf", "image/jpeg", "image/png", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"])).min(1).max(5),
});

export async function POST(request: Request, { params }: { params: Promise<{ shareId: string }> }) {
  try {
    assertSameOrigin(request);
    const { shareId } = await params;
    const input = schema.parse(await request.json());
    const { supabase, user } = await requireTenantRole(["owner", "admin", "analyst", "sales"], request);
    const { data: share, error: shareError } = await supabase.from("client_portal_shares").select("id, tenant_id").eq("id", shareId).single();
    if (shareError || !share) return NextResponse.json({ message: "Compartilhamento não encontrado." }, { status: 404 });
    const { error } = await supabase.from("document_requests").insert({
      tenant_id: share.tenant_id, share_id: share.id, title: input.title, description: input.description || null,
      due_at: input.dueAt || null, allowed_mime_types: input.allowedMimeTypes, requested_by: user.id,
    });
    if (error) throw error;
    return NextResponse.json({ data: { created: true } }, { status: 201 });
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : error instanceof Error && ["UNAUTHORIZED", "FORBIDDEN"].includes(error.message) ? 403 : 500;
    return NextResponse.json({ message: status === 400 ? "Dados da solicitação inválidos." : status === 403 ? "Você não tem permissão para solicitar documentos." : "Não foi possível criar a solicitação." }, { status });
  }
}
