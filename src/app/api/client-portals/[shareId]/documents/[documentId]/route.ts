import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/security";
import { createAdminClient } from "@/lib/supabase/admin";

const paramsSchema = z.object({ shareId: z.string().uuid(), documentId: z.string().uuid() });

/** Download, pela equipe, de um arquivo enviado pelo cliente. A posse é conferida com o cliente do usuário (RLS) antes de ler o arquivo. */
export async function GET(_request: Request, { params }: { params: Promise<{ shareId: string; documentId: string }> }) {
  try {
    const { shareId, documentId } = paramsSchema.parse(await params);
    const { supabase } = await requireUser();
    const { data: document } = await supabase
      .from("client_documents")
      .select("storage_path, original_filename, mime_type, document_requests!inner(share_id)")
      .eq("id", documentId)
      .eq("document_requests.share_id", shareId)
      .maybeSingle();
    if (!document) return NextResponse.json({ message: "Arquivo não encontrado." }, { status: 404 });
    const { data: blob, error } = await createAdminClient().storage.from("client-documents").download(document.storage_path as string);
    if (error || !blob) return NextResponse.json({ message: "Arquivo indisponível no armazenamento." }, { status: 404 });
    const filename = String(document.original_filename).replace(/["\r\n]/g, "_");
    return new NextResponse(blob, {
      headers: {
        "Content-Type": String(document.mime_type),
        "Content-Disposition": `attachment; filename="${filename.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : error instanceof Error && error.message === "UNAUTHORIZED" ? 401 : 500;
    return NextResponse.json({ message: status === 401 ? "Sessão necessária." : "Não foi possível baixar o arquivo." }, { status });
  }
}
