import "server-only";
import { isLocalBackend } from "@/lib/local-db/mode";
import { getPool } from "@/lib/local-db/pool";

/**
 * Limitador compartilhado entre TODOS os processos de coleta (espelho, histórico, itens, watchdog).
 * O PNCP limita por IP (HTTP 429); sem isso, vários processos somados estouram o limite mesmo que cada um seja educado.
 * Cada chamada reserva um horário no banco (linha travada, atômico entre processos) e espera a sua vez.
 * Só atua no backend próprio (VPS). Intervalo: PNCP_MIN_INTERVAL_MS (padrão 1800 ms ≈ 0,55 chamada/s no total; medido: 1 chamada/s é bloqueada após ~7, 1 a cada 2 s passa sem erro).
 */
let prepared: Promise<void> | null = null;

function prepare() {
  prepared ??= (async () => {
    const pool = getPool();
    await pool.query("create schema if not exists local_meta");
    await pool.query("create table if not exists local_meta.rate_limit (key text primary key, next_at timestamptz not null default now())");
    await pool.query("insert into local_meta.rate_limit (key) values ('pncp') on conflict do nothing");
  })();
  return prepared;
}

export async function waitForPncpSlot() {
  if (!isLocalBackend()) return;
  const interval = Math.max(100, Math.min(Number(process.env.PNCP_MIN_INTERVAL_MS ?? 1800), 10_000));
  await prepare();
  const { rows } = await getPool().query<{ wait_ms: number }>(
    `with slot as (select greatest(now(), next_at) as at from local_meta.rate_limit where key = 'pncp' for update)
     update local_meta.rate_limit r set next_at = slot.at + ($1::int * interval '1 millisecond')
     from slot where r.key = 'pncp'
     returning (extract(epoch from (slot.at - now())) * 1000)::float8 as wait_ms`,
    [interval],
  );
  const waitMs = Number(rows[0]?.wait_ms ?? 0);
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
}

/** Recebeu 429: empurra o próximo horário para todos os processos, que pausam juntos. */
export async function backoffPncp(ms = 60_000) {
  if (!isLocalBackend()) return;
  await prepare();
  await getPool().query(
    "update local_meta.rate_limit set next_at = greatest(next_at, now() + ($1::int * interval '1 millisecond')) where key = 'pncp'",
    [ms],
  );
}
