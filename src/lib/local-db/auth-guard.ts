import "server-only";
import { getPool } from "@/lib/local-db/pool";

/**
 * Proteção contra força bruta e abuso das rotas de conta, compartilhada por todas as instâncias (Postgres).
 * - Login: 5 falhas por e-mail em 15 min bloqueiam aquele e-mail por 15 min; 30 falhas por IP bloqueiam o IP.
 * - Cadastro: 5 contas por IP por hora. Recuperação de senha: 5 pedidos por IP por hora.
 * A resposta não diz se o e-mail existe (mesma mensagem para conta inexistente e senha errada).
 */
type Action = "login" | "signup" | "reset";
const LIMITS: Record<Action, { key: number; ip: number; windowMinutes: number }> = {
  login: { key: 5, ip: 30, windowMinutes: 15 },
  signup: { key: 3, ip: 5, windowMinutes: 60 },
  reset: { key: 3, ip: 5, windowMinutes: 60 },
};

let prepared: Promise<void> | null = null;
function prepare() {
  prepared ??= (async () => {
    const pool = getPool();
    await pool.query("create schema if not exists local_meta");
    await pool.query("create table if not exists local_meta.auth_attempts (action text not null, key text not null, at timestamptz not null default now())");
    await pool.query("create index if not exists auth_attempts_lookup_idx on local_meta.auth_attempts (action, key, at desc)");
  })();
  return prepared;
}

export class TooManyAttemptsError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super("Muitas tentativas. Aguarde alguns minutos e tente novamente.");
  }
}

const emailKey = (email: string) => `email:${email.trim().toLowerCase()}`;
const ipKey = (ip?: string | null) => (ip ? `ip:${ip}` : null);

/** Lança TooManyAttemptsError se o e-mail ou o IP passaram do limite na janela. */
export async function assertAllowed(action: Action, email: string, ip?: string | null) {
  await prepare();
  const limit = LIMITS[action];
  const keys = [emailKey(email), ipKey(ip)].filter(Boolean) as string[];
  const { rows } = await getPool().query<{ key: string; n: number; oldest: Date }>(
    `select key, count(*)::int as n, min(at) as oldest from local_meta.auth_attempts
     where action = $1 and key = any($2) and at > now() - ($3::int * interval '1 minute') group by key`,
    [action, keys, limit.windowMinutes],
  );
  for (const row of rows) {
    const max = row.key.startsWith("ip:") ? limit.ip : limit.key;
    if (row.n >= max) {
      const retry = Math.max(30, Math.ceil((new Date(row.oldest).getTime() + limit.windowMinutes * 60_000 - Date.now()) / 1000));
      throw new TooManyAttemptsError(retry);
    }
  }
}

/** Registra uma tentativa (falha de login, ou cada cadastro/pedido de recuperação). */
export async function recordAttempt(action: Action, email: string, ip?: string | null) {
  await prepare();
  const keys = [emailKey(email), ipKey(ip)].filter(Boolean) as string[];
  await getPool().query("insert into local_meta.auth_attempts (action, key) select $1, unnest($2::text[])", [action, keys]);
  // limpeza oportunista do que já saiu de qualquer janela
  if (Math.random() < 0.02) await getPool().query("delete from local_meta.auth_attempts where at < now() - interval '1 day'");
}

/** Login certo zera as falhas daquele e-mail (as do IP continuam contando). */
export async function clearLoginFailures(email: string) {
  await prepare();
  await getPool().query("delete from local_meta.auth_attempts where action = 'login' and key = $1", [emailKey(email)]);
}

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,63}$/;
export function validEmail(email: unknown): email is string {
  return typeof email === "string" && email.length <= 254 && EMAIL.test(email.trim());
}
export function validPassword(password: unknown): password is string {
  return typeof password === "string" && password.length >= 8 && password.length <= 128;
}
/** Metadados de cadastro: só nome e empresa, texto curto. Evita gravar JSON arbitrário enviado pelo navegador. */
export function cleanSignupMetadata(data: unknown) {
  const source = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === "string" ? value.trim().slice(0, 120) : undefined);
  const result: Record<string, string> = {};
  const displayName = text(source.display_name);
  const companyName = text(source.company_name);
  if (displayName) result.display_name = displayName;
  if (companyName) result.company_name = companyName;
  return result;
}
