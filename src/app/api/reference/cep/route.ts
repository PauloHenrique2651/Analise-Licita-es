import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/security";
import { lookupAddress } from "@/services/address-service";

const cepSchema = z.string().transform((value) => value.replace(/\D/g, "")).pipe(z.string().regex(/^\d{8}$/));

export async function GET(request: Request) {
  try {
    await requireUser();
    const cep = cepSchema.parse(new URL(request.url).searchParams.get("cep"));
    const data = await lookupAddress(cep);
    return NextResponse.json({ data }, { headers: { "Cache-Control": "private, max-age=3600" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const unauthorized = code === "UNAUTHORIZED" || code === "AUTH_NOT_CONFIGURED";
    return NextResponse.json({ message: unauthorized ? "Sessão necessária." : error instanceof z.ZodError ? "CEP inválido." : "As fontes de CEP não responderam." }, { status: unauthorized ? 401 : error instanceof z.ZodError ? 400 : 502 });
  }
}
