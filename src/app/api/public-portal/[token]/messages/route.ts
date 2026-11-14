import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin } from "@/lib/security";
import { createAdminClient } from "@/lib/supabase/admin";
import { portalTokenHash } from "@/services/portal-service";

const schema = z.object({
  senderName: z.string().trim().min(2).max(120),
  body: z.string().trim().min(1).max(4000),
});

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    assertSameOrigin(request);
    const { token } = await params;
    const tokenHash = portalTokenHash(token);
    if (!tokenHash) return NextResponse.json({ message: "Link inválido." }, { status: 404 });
    const input = schema.parse(await request.json());
    const supabase = createAdminClient();
    const { data: share, error: shareError } = await supabase
      .from("client_portal_shares")
      .select("id, tenant_id, expires_at, revoked_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (shareError || !share || share.revoked_at || new Date(share.expires_at).getTime() <= Date.now()) throw new Error("NOT_FOUND");
    const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
    const { count } = await supabase.from("portal_messages").select("id", { count: "exact", head: true })
      .eq("share_id", share.id).eq("sender_type", "client").gte("created_at", oneMinuteAgo);
    if ((count ?? 0) >= 10) throw new Error("RATE_LIMIT");
    const { error } = await supabase.from("portal_messages").insert({
      tenant_id: share.tenant_id, share_id: share.id, sender_type: "client", sender_name: input.senderName, body: input.body,
    });
    if (error) throw error;
    return NextResponse.json({ data: { sent: true } }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const status = error instanceof z.ZodError ? 400 : code === "NOT_FOUND" ? 404 : code === "RATE_LIMIT" ? 429 : 500;
    return NextResponse.json({ message: status === 400 ? "Mensagem inválida." : status === 404 ? "Link inválido ou expirado." : status === 429 ? "Aguarde um minuto antes de enviar outra mensagem." : "Não foi possível enviar agora." }, { status });
  }
}
