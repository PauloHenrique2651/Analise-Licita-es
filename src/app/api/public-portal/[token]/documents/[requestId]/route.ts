import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin } from "@/lib/security";
import { createAdminClient } from "@/lib/supabase/admin";
import { portalTokenHash } from "@/services/portal-service";

const routeSchema = z.object({ token: z.string().min(32).max(128), requestId: z.string().uuid() });
const extensionByMime: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};

const allowedMimeTypes = Object.keys(extensionByMime);

async function ensureDocumentsBucket(supabase: ReturnType<typeof createAdminClient>) {
  const { data: bucket } = await supabase.storage.getBucket("client-documents");
  if (bucket) return;
  const { error } = await supabase.storage.createBucket("client-documents", {
    public: false,
    fileSizeLimit: 26_214_400,
    allowedMimeTypes,
  });
  if (error && !/already exists/i.test(error.message)) throw new Error("DOCUMENT_STORAGE_UNAVAILABLE");
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string; requestId: string }> }) {
  let uploadedPath: string | null = null;
  try {
    assertSameOrigin(request);
    const route = routeSchema.parse(await params);
    const tokenHash = portalTokenHash(route.token);
    if (!tokenHash) throw new Error("NOT_FOUND");
    const supabase = createAdminClient();
    await ensureDocumentsBucket(supabase);
    const { data: documentRequest, error: requestError } = await supabase
      .from("document_requests")
      .select("id, tenant_id, share_id, allowed_mime_types, max_size_bytes, status, client_portal_shares!inner(token_hash, expires_at, revoked_at)")
      .eq("id", route.requestId)
      .eq("client_portal_shares.token_hash", tokenHash)
      .single();
    if (requestError || !documentRequest) throw new Error("NOT_FOUND");
    const share = Array.isArray(documentRequest.client_portal_shares) ? documentRequest.client_portal_shares[0] : documentRequest.client_portal_shares;
    if (!share || share.revoked_at || new Date(share.expires_at).getTime() <= Date.now()) throw new Error("NOT_FOUND");

    const form = await request.formData();
    const file = form.get("file");
    const uploaderName = z.string().trim().min(2).max(120).parse(form.get("uploaderName"));
    if (!(file instanceof File) || file.size < 1) throw new Error("INVALID_FILE");
    if (file.size > Number(documentRequest.max_size_bytes)) throw new Error("FILE_TOO_LARGE");
    if (!documentRequest.allowed_mime_types.includes(file.type) || !extensionByMime[file.type]) throw new Error("INVALID_FILE_TYPE");

    const bytes = Buffer.from(await file.arrayBuffer());
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    uploadedPath = `${documentRequest.share_id}/${documentRequest.id}/${randomUUID()}.${extensionByMime[file.type]}`;
    const { error: uploadError } = await supabase.storage.from("client-documents").upload(uploadedPath, bytes, { contentType: file.type, upsert: false });
    if (uploadError) throw uploadError;

    const { error: insertError } = await supabase.from("client_documents").insert({
      tenant_id: documentRequest.tenant_id,
      request_id: documentRequest.id,
      storage_path: uploadedPath,
      original_filename: file.name.slice(0, 255),
      mime_type: file.type,
      size_bytes: file.size,
      sha256,
      uploaded_by_name: uploaderName,
    });
    if (insertError) throw insertError;
    await supabase.from("document_requests").update({ status: "uploaded", updated_at: new Date().toISOString() }).eq("id", documentRequest.id);
    return NextResponse.json({ data: { uploaded: true, sha256 } }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (uploadedPath) {
      try { await createAdminClient().storage.from("client-documents").remove([uploadedPath]); } catch { /* compensação sem ocultar o erro original */ }
    }
    const code = error instanceof Error ? error.message : "";
    const status = code === "NOT_FOUND" ? 404 : code === "FILE_TOO_LARGE" ? 413 : code === "DOCUMENT_STORAGE_UNAVAILABLE" ? 503 : 400;
    const message = status === 404 ? "Solicitação inválida ou acesso expirado."
      : status === 413 ? "Arquivo maior que o limite solicitado."
      : status === 503 ? "O recebimento de documentos está indisponível no momento. Tente novamente em instantes."
      : code === "INVALID_FILE_TYPE" ? "Tipo de arquivo não permitido."
      : "Não foi possível enviar o documento.";
    return NextResponse.json({ message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
