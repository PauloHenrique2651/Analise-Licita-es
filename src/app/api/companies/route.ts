import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, requireTenantRole } from "@/lib/security";
import { saveCompany } from "@/services/company-service";
import { isValidCnpj, normalizeCnpj } from "@/utils/cnpj";

const schema = z.object({ cnpj: z.string().transform(normalizeCnpj).refine(isValidCnpj) });

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { tenantId } = await requireTenantRole(["owner", "admin", "analyst"]);
    const input = schema.parse(await request.json());
    const data = await saveCompany(input.cnpj, tenantId);
    return NextResponse.json({ data }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const status = code === "UNAUTHORIZED" || code === "AUTH_NOT_CONFIGURED" ? 401
      : code === "FORBIDDEN" ? 403
      : error instanceof z.ZodError ? 400
      : 502;
    return NextResponse.json({ message: status === 400 ? "CNPJ inválido." : status === 403 ? "Permissão insuficiente." : status === 401 ? "Sessão necessária." : "Não foi possível salvar a empresa." }, { status });
  }
}
