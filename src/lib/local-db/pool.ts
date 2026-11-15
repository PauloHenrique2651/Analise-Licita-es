import "server-only";
import { Pool, type PoolClient } from "pg";

declare global {
  var __nexoLocalPool: Pool | undefined;
  var __nexoReadPools: Array<{ pool: Pool; downUntil: number }> | undefined;
  var __nexoReadCursor: number | undefined;
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

/**
 * Réplicas de leitura (LOCAL_DATABASE_READ_URLS, separadas por vírgula). Cada consulta elegível vai para a próxima
 * réplica saudável (rodízio); réplica que falha fica fora por 30 s e a consulta cai para o primário, então o sistema
 * continua de pé mesmo sem réplica. Sem a variável, tudo vai para o primário.
 */
function readPools() {
  if (!globalThis.__nexoReadPools) {
    const urls = (process.env.LOCAL_DATABASE_READ_URLS ?? "").split(",").map((value) => value.trim()).filter(Boolean);
    globalThis.__nexoReadPools = urls.map((connectionString) => ({
      pool: new Pool({ connectionString, max: Number(process.env.LOCAL_DATABASE_READ_POOL_MAX ?? 10), idleTimeoutMillis: 30_000, connectionTimeoutMillis: 3_000 }),
      downUntil: 0,
    }));
  }
  return globalThis.__nexoReadPools;
}

function pickReadReplica() {
  const pools = readPools();
  if (!pools.length) return null;
  const now = Date.now();
  for (let attempt = 0; attempt < pools.length; attempt += 1) {
    globalThis.__nexoReadCursor = ((globalThis.__nexoReadCursor ?? -1) + 1) % pools.length;
    const candidate = pools[globalThis.__nexoReadCursor];
    if (candidate.downUntil <= now) return candidate;
  }
  return null;
}

async function runWithPool<T>(pool: Pool, identity: DbIdentity, work: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();
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

const REPLICA_UNAVAILABLE = /ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|terminat|timeout|57P0[1-3]|08\d{3}|recovery|standby/i;

/**
 * Executa `work` numa transação com o mesmo contexto que o PostgREST aplica (papel + claims JWT), preservando o RLS.
 * `options.replica`: consulta só de leitura sobre dados coletados, que pode ser atendida por uma réplica.
 */
export async function withIdentity<T>(identity: DbIdentity, work: (client: PoolClient) => Promise<T>, options: { replica?: boolean } = {}) {
  // Só consultas de usuários (anon/authenticated). A coleta e tarefas administrativas (service_role) leem para depois gravar
  // e precisam enxergar o que acabaram de escrever, então vão sempre ao primário.
  if (options.replica && identity.role !== "service_role") {
    const replica = pickReadReplica();
    if (replica) {
      try {
        return await runWithPool(replica.pool, identity, work);
      } catch (error) {
        const code = (error as { code?: string }).code ?? "";
        if (!REPLICA_UNAVAILABLE.test(`${code} ${(error as Error).message}`)) throw error;
        replica.downUntil = Date.now() + 30_000;
      }
    }
  }
  return runWithPool(getPool(), identity, work);
}
