import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, requireTenantRole, requireUser } from "@/lib/security";

const idSchema = z.string().uuid();

/** Visão da equipe sobre um link: conversa completa, solicitações e arquivos recebidos. O RLS limita à empresa ativa. */
export async function GET(_request: Request, { params }: { params: Promise<{ shareId: string }> }) {
  try {
    const shareId = idSchema.parse((await params).shareId);
    const { supabase } = await requireUser();
    const { data: share } = await supabase.from("client_portal_shares").select("id, client_name, client_email, expires_at, revoked_at, last_accessed_at, created_at").eq("id", shareId).maybeSingle();
    if (!share) return NextResponse.json({ message: "Compartilhamento não encontrado." }, { status: 404 });
    const [{ data: messages }, { data: requests }] = await Promise.all([
      supabase.from("portal_messages").select("id, sender_type, sender_name, body, created_at").eq("share_id", shareId).order("created_at", { ascending: true }).limit(500),
      supabase.from("document_requests").select("id, title, description, status, due_at, allowed_mime_types, created_at").eq("share_id", shareId).order("created_at", { ascending: false }),
    ]);
    const requestIds = (requests ?? []).map((row) => row.id as string);
    const { data: documents } = requestIds.length
      ? await supabase.from("client_documents").select("id, request_id, original_filename, mime_type, size_bytes, uploaded_by_name, uploaded_at").in("request_id", requestIds).order("uploaded_at", { ascending: false })
      : { data: [] };
    return NextResponse.json({
      data: {
        share: { id: share.id, clientName: share.client_name, clientEmail: share.client_email, expiresAt: share.expires_at, revokedAt: share.revoked_at, lastAccessedAt: share.last_accessed_at },
        messages: (messages ?? []).map((row) => ({ id: row.id, senderType: row.sender_type, senderName: row.sender_name, body: row.body, createdAt: row.created_at })),
        requests: (requests ?? []).map((row) => ({
          id: row.id, title: row.title, description: row.description, status: row.status, dueAt: row.due_at, allowedMimeTypes: row.allowed_mime_types, createdAt: row.created_at,
          documents: (documents ?? []).filter((doc) => doc.request_id === row.id).map((doc) => ({ id: doc.id, filename: doc.original_filename, mimeType: doc.mime_type, sizeBytes: Number(doc.size_bytes), uploadedBy: doc.uploaded_by_name, uploadedAt: doc.uploaded_at })),
        })),
      },
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : error instanceof Error && error.message === "UNAUTHORIZED" ? 401 : 500;
    return NextResponse.json({ message: status === 401 ? "Sessão necessária." : "Não foi possível carregar o compartilhamento." }, { status });
  }
}

/** Revoga o link: o cliente perde o acesso na hora. */
export async function DELETE(request: Request, { params }: { params: Promise<{ shareId: string }> }) {
  try {
    assertSameOrigin(request);
    const shareId = idSchema.parse((await params).shareId);
    const { supabase } = await requireTenantRole(["owner", "admin", "analyst", "sales"], request);
    const { data, error } = await supabase.from("client_portal_shares").update({ revoked_at: new Date().toISOString() }).eq("id", shareId).is("revoked_at", null).select("id");
    if (error) throw error;
    if (!data?.length) return NextResponse.json({ message: "Compartilhamento não encontrado ou já revogado." }, { status: 404 });
    return NextResponse.json({ data: { revoked: true } });
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : error instanceof Error && ["UNAUTHORIZED", "FORBIDDEN", "TENANT_NOT_FOUND"].includes(error.message) ? 403 : error instanceof Error && error.message === "INVALID_ORIGIN" ? 403 : 500;
    return NextResponse.json({ message: status === 403 ? "Você não tem permissão para revogar este link." : "Não foi possível revogar o link." }, { status });
  }
}
