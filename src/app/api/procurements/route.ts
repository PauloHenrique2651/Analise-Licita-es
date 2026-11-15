import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { toSearchRpcParams } from "@/repositories/procurement-repository";

const optionalNumber = z.preprocess((value) => value === null || value === "" ? undefined : value, z.coerce.number().nonnegative().optional());
const querySchema = z.object({
  text: z.string().trim().max(120).optional(),
  state: z.string().trim().length(2).optional(),
  city: z.string().trim().max(120).optional(),
  cityIbge: z.string().trim().regex(/^\d{7}$/).optional(),
  agency: z.string().trim().max(160).optional(),
  agencyCnpj: z.string().trim().max(18).optional(),
  modality: z.string().trim().max(80).optional(),
  portal: z.enum(["PNCP", "COMPRAS_GOV", "RJ_DADOS_ABERTOS_SIGA"]).optional(),
  status: z.string().trim().max(80).optional(),
  publishedFrom: z.iso.datetime({ offset: true }).or(z.iso.date()).optional(),
  publishedTo: z.iso.datetime({ offset: true }).or(z.iso.date()).optional(),
  proposalUntil: z.iso.datetime({ offset: true }).or(z.iso.date()).optional(),
  minValue: optionalNumber,
  maxValue: optionalNumber,
  disputeMode: z.string().trim().max(40).optional(),
  meEpp: z.enum(["exclusiva", "com_beneficio", "sem"]).optional(),
  itemKind: z.enum(["material", "servico"]).optional(),
  openOnly: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function GET(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ message: "Base de dados temporariamente indisponível." }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Sessão necessária." }, { status: 401 });
  try {
    const url = new URL(request.url);
    const filters = querySchema.parse(Object.fromEntries(url.searchParams));
    const { data, error } = await supabase.rpc("search_procurements", toSearchRpcParams(filters));
    if (error) throw error;
    return NextResponse.json({ data, total: Number(data?.[0]?.total_count ?? 0) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ message: error instanceof z.ZodError ? "Filtros inválidos." : "Falha ao consultar licitações." }, { status: error instanceof z.ZodError ? 400 : 500 });
  }
}
