import "server-only";
import { Pool, type PoolClient } from "pg";

declare global {
  var __nexoLocalPool: Pool | undefined;
}

export function getPool() {
  if (!globalThis.__nexoLocalPool) {
    const connectionString = process.env.LOCAL_DATABASE_URL;
    if (!connectionString) throw new Error("LOCAL_DATABASE_URL não configurada para o banco local.");
    globalThis.__nexoLocalPool = new Pool({ connectionString, max: 10, idleTimeoutMillis: 30_000 });
  }
  return globalThis.__nexoLocalPool;
}

export type DbRole = "anon" | "authenticated" | "service_role";

export interface DbIdentity {
  role: DbRole;
  userId?: string | null;
  email?: string | null;
}

/** Executa `work` numa transação com o mesmo contexto que o PostgREST aplica (papel + claims JWT), preservando o RLS. */
export async function withIdentity<T>(identity: DbIdentity, work: (client: PoolClient) => Promise<T>) {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const claims = JSON.stringify({ sub: identity.userId ?? undefined, role: identity.role, email: identity.email ?? undefined });
    await client.query(
      "select set_config('role', $1, true), set_config('request.jwt.claims', $2, true), set_config('request.jwt.claim.sub', $3, true)",
      [identity.role, claims, identity.userId ?? ""],
    );
    const result = await work(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
