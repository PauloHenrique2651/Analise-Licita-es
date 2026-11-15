import "server-only";
import { isLocalBackend } from "@/lib/local-db/mode";
import { getPool } from "@/lib/local-db/pool";

/**
 * Cache compartilhado (Postgres) para respostas de APIs públicas consultadas ao vivo pelas telas.
 * - Todas as instâncias do app e todos os usuários dividem a mesma resposta: a API do governo recebe 1 chamada, não 1 por usuário.
 * - Chamadas iguais ao mesmo tempo viram uma só (coalescência dentro do processo).
 * - Se a API cair, devolve a última resposta guardada mesmo vencida (melhor que erro na tela).
 * Só atua no backend próprio (VPS); no Supabase só executa a chamada.
 */
const inflight = new Map<string, Promise<unknown>>();
let prepared: Promise<void> | null = null;

function prepare() {
  prepared ??= (async () => {
    const pool = getPool();
    await pool.query("create schema if not exists local_meta");
    await pool.query("create table if not exists local_meta.api_cache (key text primary key, body jsonb not null, fetched_at timestamptz not null default now(), expires_at timestamptz not null)");
    await pool.query("create index if not exists api_cache_expires_idx on local_meta.api_cache (expires_at)");
  })();
  return prepared;
}

export async function sharedCache<T>(key: string, ttlSeconds: number, load: () => Promise<T>): Promise<T> {
  if (!isLocalBackend() || ttlSeconds <= 0) return load();
  const pending = inflight.get(key) as Promise<T> | undefined;
  if (pending) return pending;
  const run = (async () => {
    await prepare();
    const pool = getPool();
    const fresh = await pool.query<{ body: T }>("select body from local_meta.api_cache where key = $1 and expires_at > now()", [key]);
    if (fresh.rows[0]) return fresh.rows[0].body;
    try {
      const value = await load();
      await pool.query(
        `insert into local_meta.api_cache (key, body, expires_at) values ($1, $2::jsonb, now() + ($3::int * interval '1 second'))
         on conflict (key) do update set body = excluded.body, fetched_at = now(), expires_at = excluded.expires_at`,
        [key, JSON.stringify(value ?? null), ttlSeconds],
      );
      return value;
    } catch (error) {
      const stale = await pool.query<{ body: T }>("select body from local_meta.api_cache where key = $1", [key]);
      if (stale.rows[0]) return stale.rows[0].body;
      throw error;
    }
  })().finally(() => { inflight.delete(key); });
  inflight.set(key, run);
  return run;
}

/** Limpeza de entradas vencidas há mais de 7 dias (chamada pelo job diário). */
export async function purgeApiCache() {
  if (!isLocalBackend()) return 0;
  await prepare();
  const result = await getPool().query("delete from local_meta.api_cache where expires_at < now() - interval '7 days'");
  return result.rowCount ?? 0;
}
