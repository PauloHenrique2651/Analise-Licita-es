import type { NextRequest } from "next/server";
import { localOnly } from "@/lib/local-db/route-helpers";
import { getPool } from "@/lib/local-db/pool";
import { LOCAL_SESSION_COOKIE } from "@/lib/local-db/session";
import { verifyActiveToken } from "@/lib/local-db/server-client";

// Substituto do Supabase Realtime na homologação: o navegador consulta contadores de escrita
// por tabela e atualiza a tela quando eles mudam.
export async function GET(request: NextRequest) {
  const blocked = localOnly();
  if (blocked) return blocked;
  if (!(await verifyActiveToken(request.cookies.get(LOCAL_SESSION_COOKIE)?.value))) return Response.json({}, { status: 401 });
  const tables = (request.nextUrl.searchParams.get("tables") ?? "").split(",").filter((name) => /^[a-z_]+$/.test(name)).slice(0, 20);
  if (!tables.length) return Response.json({});
  const { rows } = await getPool().query<{ relname: string; writes: string }>(
    "select relname, (n_tup_ins + n_tup_upd + n_tup_del)::text as writes from pg_stat_user_tables where schemaname = 'public' and relname = any($1)",
    [tables],
  );
  return Response.json(Object.fromEntries(rows.map((row) => [row.relname, Number(row.writes)])), { headers: { "Cache-Control": "no-store" } });
}
