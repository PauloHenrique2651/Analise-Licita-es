import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, requireUser } from "@/lib/security";

const createSchema = z.object({
  procurementId: z.string().uuid(),
  expiresInDays: z.number().int().min(1).max(30).default(7),
  clientName: z.string().trim().min(2).max(120),
  clientEmail: z.string().email().max(254).optional(),
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { supabase, user } = await requireUser();
    const input = createSchema.parse(await request.json());
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + input.expiresInDays * 86_400_000).toISOString();
    const { data, error } = await supabase.from("client_portal_shares").insert({
      procurement_id: input.procurementId,
      token_hash: tokenHash,
      expires_at: expiresAt,
      client_name: input.clientName,
      client_email: input.clientEmail ?? null,
      created_by: user.id,
    }).select("id, expires_at").single();
    if (error) throw error;
    const base = new URL(request.url).origin;
    return NextResponse.json({ data: { id: data.id, expiresAt: data.expires_at, url: `${base}/p/${token}` } }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const unauthorized = error instanceof Error && ["UNAUTHORIZED", "AUTH_NOT_CONFIGURED"].includes(error.message);
    return NextResponse.json({ message: unauthorized ? "Sessão necessária." : error instanceof z.ZodError ? "Dados inválidos." : "Não foi possível criar o compartilhamento." }, { status: unauthorized ? 401 : error instanceof z.ZodError ? 400 : 500 });
  }
}
