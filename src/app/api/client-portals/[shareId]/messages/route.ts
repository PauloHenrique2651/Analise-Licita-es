import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, requireTenantRole } from "@/lib/security";

const schema = z.object({ body: z.string().trim().min(1).max(4000) });

export async function POST(request: Request, { params }: { params: Promise<{ shareId: string }> }) {
  try {
    assertSameOrigin(request);
    const { shareId } = await params;
    const input = schema.parse(await request.json());
    const { supabase, user } = await requireTenantRole(["owner", "admin", "analyst", "sales"], request);
    const { data: share, error: shareError } = await supabase.from("client_portal_shares").select("id, tenant_id").eq("id", shareId).single();
    if (shareError || !share) return NextResponse.json({ message: "Compartilhamento não encontrado." }, { status: 404 });
    const { data: profile } = await supabase.from("users").select("display_name").eq("id", user.id).maybeSingle();
    const senderName = profile?.display_name || user.email?.split("@")[0] || "Equipe";
    const { error } = await supabase.from("portal_messages").insert({
      tenant_id: share.tenant_id, share_id: share.id, sender_type: "tenant_user", sender_user_id: user.id, sender_name: senderName, body: input.body,
    });
    if (error) throw error;
    return NextResponse.json({ data: { sent: true } }, { status: 201 });
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : error instanceof Error && ["UNAUTHORIZED", "FORBIDDEN"].includes(error.message) ? 403 : 500;
    return NextResponse.json({ message: status === 400 ? "Mensagem inválida." : status === 403 ? "Você não tem permissão para responder." : "Não foi possível enviar a mensagem." }, { status });
  }
}
