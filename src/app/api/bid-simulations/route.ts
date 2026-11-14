import { NextResponse } from "next/server";
import { z } from "zod";
import { BidSimulationError, simulateBid } from "@/services/bid-simulation-service";

const bodySchema = z.object({
  procurementItemId: z.uuid(),
  productDescription: z.string().trim().min(2).max(300),
  offeredUnitValue: z.coerce.number().finite().positive(),
});

export async function POST(request: Request) {
  try {
    const input = bodySchema.parse(await request.json());
    const data = await simulateBid(input);
    return NextResponse.json({ data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ message: "Informe um item, produto e preço unitário válidos." }, { status: 400 });
    if (error instanceof BidSimulationError) {
      const status = error.code === "UNAUTHORIZED" ? 401 : error.code === "NOT_FOUND" ? 404 : error.code === "TENANT_REQUIRED" ? 409 : 500;
      const message = error.code === "TENANT_REQUIRED" ? "Selecione uma empresa ativa antes de salvar a simulação." : "Não foi possível concluir a simulação.";
      return NextResponse.json({ message }, { status });
    }
    return NextResponse.json({ message: "Não foi possível consultar os dados de comparação." }, { status: 500 });
  }
}
