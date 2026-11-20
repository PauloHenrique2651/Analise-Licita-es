import { NextResponse } from "next/server";
import { isLocalBackend } from "@/lib/local-db/mode";
import { getPool } from "@/lib/local-db/pool";

export const dynamic = "force-dynamic";

/** Verificação de saúde para o balanceador/monitor: responde 200 se a instância e o banco estão de pé. Sem dados internos. */
export async function GET() {
  try {
    if (isLocalBackend()) await Promise.race([getPool().query("select 1"), new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 2_000))]);
    return NextResponse.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
