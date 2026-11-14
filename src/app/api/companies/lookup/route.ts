import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/security";
import { lookupCompany } from "@/services/company-service";

const querySchema = z.string().regex(/^\d{14}$/);

export async function GET(request: Request) {
  try {
    await requireUser();
    const cnpj = querySchema.parse(new URL(request.url).searchParams.get("cnpj"));
    const data = await lookupCompany(cnpj);
    return NextResponse.json({ data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const unauthorized = error instanceof Error && ["UNAUTHORIZED", "AUTH_NOT_CONFIGURED"].includes(error.message);
    const invalid = error instanceof z.ZodError || (error instanceof Error && error.message === "CNPJ inválido.");
    return NextResponse.json({ message: unauthorized ? "Sessão necessária." : invalid ? "CNPJ inválido." : "A fonte de CNPJ não respondeu. Tente novamente." }, { status: unauthorized ? 401 : invalid ? 400 : 502 });
  }
}
