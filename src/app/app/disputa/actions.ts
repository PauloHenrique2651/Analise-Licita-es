"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseMoney } from "@/lib/dispute-copilot";
import { requireTenantRole } from "@/lib/security";

export interface SaveStrategyState {
  status: "idle" | "saved" | "error";
  message: string | null;
}

const money = z.string().trim().transform((value, context) => {
  const parsed = parseMoney(value);
  if (parsed === null) { context.addIssue({ code: "custom", message: "Valor inválido." }); return z.NEVER; }
  return parsed;
});

const optionalMoney = z.string().trim().transform((value, context) => {
  if (!value) return null;
  const parsed = parseMoney(value);
  if (parsed === null || parsed <= 0) { context.addIssue({ code: "custom", message: "Valor inválido." }); return z.NEVER; }
  return parsed;
});

const strategySchema = z.object({
  itemId: z.uuid(),
  unitCost: money,
  minMarginPct: money.pipe(z.number().min(0).max(1000)),
  openingBid: optionalMoney,
  minDecrement: money.pipe(z.number().positive()),
  decrementType: z.enum(["valor", "percentual"]),
  notes: z.string().trim().max(2000).transform((value) => value || null),
});

export async function saveBidStrategy(_previous: SaveStrategyState, form: FormData): Promise<SaveStrategyState> {
  const parsed = strategySchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    const names: Record<string, string> = { unitCost: "custo unitário", minMarginPct: "margem mínima", openingBid: "lance inicial", minDecrement: "intervalo mínimo entre lances" };
    return { status: "error", message: `Confira o campo ${names[String(field)] ?? "destacado"}: use números como 1.234,56.` };
  }
  try {
    const { supabase, user, tenantId } = await requireTenantRole(["owner", "admin", "analyst", "sales"]);
    const input = parsed.data;
    const { error } = await supabase.from("bid_strategies").upsert({
      tenant_id: tenantId,
      procurement_item_id: input.itemId,
      created_by: user.id,
      unit_cost: input.unitCost,
      min_margin_pct: input.minMarginPct,
      opening_bid: input.openingBid,
      min_decrement: input.minDecrement,
      decrement_type: input.decrementType,
      notes: input.notes,
      updated_at: new Date().toISOString(),
    }, { onConflict: "tenant_id,procurement_item_id" });
    if (error) throw error;
    revalidatePath("/app/disputa");
    return { status: "saved", message: "Estratégia salva." };
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    return {
      status: "error",
      message: code === "FORBIDDEN" ? "Seu perfil não pode editar estratégias de disputa."
        : code === "UNAUTHORIZED" ? "Sua sessão expirou. Entre novamente."
        : "Não foi possível salvar a estratégia agora.",
    };
  }
}
