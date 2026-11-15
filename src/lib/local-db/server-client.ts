import "server-only";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { runQuery } from "@/lib/local-db/engine";
import { getPool, type DbIdentity } from "@/lib/local-db/pool";
import { LocalQueryBuilder } from "@/lib/local-db/query-builder";
import { assertAllowed, cleanSignupMetadata, clearLoginFailures, recordAttempt, TooManyAttemptsError, validEmail, validPassword } from "@/lib/local-db/auth-guard";
import {
  createLocalToken, LOCAL_SESSION_COOKIE, sessionCookieOptions, SESSION_TTL_SECONDS, verifyLocalToken, type LocalTokenPayload,
} from "@/lib/local-db/session";

/* Cliente servidor compatível com a API do supabase-js para homologação sem Supabase. */

export interface CookieAdapter {
  get(name: string): string | undefined;
  set(name: string, value: string, options: typeof sessionCookieOptions): void;
}

export interface LocalUser {
  id: string;
  aud: "authenticated";
  role: "authenticated";
  email: string | null;
  user_metadata: Record<string, unknown>;
  app_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  last_sign_in_at: string | null;
}

interface AuthUserRow {
  session_version?: number;
  id: string;
  email: string | null;
  raw_user_meta_data: Record<string, unknown> | null;
  raw_app_meta_data: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
  last_sign_in_at: Date | null;
}

class LocalAuthError extends Error {
  constructor(message: string, readonly status = 400, readonly code = "invalid_request") {
    super(message);
    this.name = "AuthApiError";
  }
}

const USER_COLUMNS = "id, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at, last_sign_in_at, session_version";

/* Versão de sessão em cache curto (5 s): evita uma consulta por requisição e derruba sessões antigas em segundos. */
const versionCache = new Map<string, { version: number; at: number }>();
async function sessionVersion(userId: string) {
  const cached = versionCache.get(userId);
  if (cached && Date.now() - cached.at < 5_000) return cached.version;
  const { rows } = await getPool().query<{ session_version: number }>("select session_version from auth.users where id = $1", [userId]);
  const version = rows[0]?.session_version ?? -1;
  versionCache.set(userId, { version, at: Date.now() });
  return version;
}

/** Token assinado, dentro da validade E emitido na versão de sessão atual do usuário (senha não mudou desde então). */
export async function verifyActiveToken(token: string | undefined | null, purpose: LocalTokenPayload["purpose"] = "session") {
  const payload = verifyLocalToken(token, purpose);
  if (!payload) return null;
  const current = await sessionVersion(payload.sub);
  return current > 0 && (payload.sv ?? 1) === current ? payload : null;
}

function toUser(row: AuthUserRow): LocalUser {
  return {
    id: row.id,
    aud: "authenticated",
    role: "authenticated",
    email: row.email,
    user_metadata: row.raw_user_meta_data ?? {},
    app_metadata: row.raw_app_meta_data ?? {},
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    last_sign_in_at: row.last_sign_in_at?.toISOString() ?? null,
  };
}

async function findUser(id: string) {
  const { rows } = await getPool().query<AuthUserRow>(`select ${USER_COLUMNS} from auth.users where id = $1`, [id]);
  return rows[0] ? toUser(rows[0]) : null;
}

function sessionFor(user: LocalUser, token: string) {
  return {
    access_token: token,
    refresh_token: token,
    token_type: "bearer",
    expires_in: SESSION_TTL_SECONDS,
    expires_at: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    user,
  };
}

export interface LocalClientOptions {
  /** IP do visitante (X-Real-IP do Nginx), para limitar tentativas de login por IP. */
  clientIp?: string | null;
  cookies?: CookieAdapter;
  accessToken?: string;
  admin?: boolean;
}

export function createLocalServerClient(options: LocalClientOptions = {}) {
  const readToken = () => options.accessToken ?? options.cookies?.get(LOCAL_SESSION_COOKIE);

  async function identity(): Promise<DbIdentity> {
    if (options.admin) return { role: "service_role" };
    const payload = await verifyActiveToken(readToken());
    return payload ? { role: "authenticated", userId: payload.sub, email: payload.email } : { role: "anon" };
  }

  const executor = async (descriptor: Parameters<typeof runQuery>[0]) => runQuery(descriptor, await identity());

  function startSession(user: LocalUser, version = 1) {
    const token = createLocalToken({ sub: user.id, email: user.email, purpose: "session", sv: version });
    options.cookies?.set(LOCAL_SESSION_COOKIE, token, sessionCookieOptions);
    return sessionFor(user, token);
  }

  const auth = {
    async getUser(token?: string) {
      const payload = await verifyActiveToken(token ?? readToken());
      const user = payload ? await findUser(payload.sub) : null;
      if (!user) return { data: { user: null }, error: new LocalAuthError("Auth session missing!", 401, "session_not_found") };
      return { data: { user }, error: null };
    },
    async getSession() {
      const token = readToken();
      const payload = await verifyActiveToken(token);
      const user = payload ? await findUser(payload.sub) : null;
      return { data: { session: user && token ? sessionFor(user, token) : null }, error: null };
    },
    async signInWithPassword({ email, password }: { email: string; password: string }) {
      const invalid = () => ({ data: { user: null, session: null }, error: new LocalAuthError("Invalid login credentials", 400, "invalid_credentials") });
      if (!validEmail(email) || typeof password !== "string" || password.length > 128) return invalid();
      try { await assertAllowed("login", email, options.clientIp); }
      catch (error) { if (error instanceof TooManyAttemptsError) return { data: { user: null, session: null }, error: new LocalAuthError(error.message, 429, "over_request_rate_limit") }; throw error; }
      const { rows } = await getPool().query<AuthUserRow>(
        `update auth.users set last_sign_in_at = now()
         where email = lower($1) and encrypted_password is not null and encrypted_password = crypt($2, encrypted_password)
         returning ${USER_COLUMNS}`,
        [email.trim(), password],
      );
      if (!rows[0]) { await recordAttempt("login", email, options.clientIp); return invalid(); }
      await clearLoginFailures(email);
      const user = toUser(rows[0]);
      return { data: { user, session: startSession(user, rows[0].session_version ?? 1) }, error: null };
    },
    async signUp({ email, password, options: signUpOptions }: { email: string; password: string; options?: { data?: Record<string, unknown> } }) {
      if (!validEmail(email)) return { data: { user: null, session: null }, error: new LocalAuthError("E-mail inválido.", 422, "validation_failed") };
      if (!validPassword(password)) return { data: { user: null, session: null }, error: new LocalAuthError("A senha precisa ter de 8 a 128 caracteres.", 422, "weak_password") };
      try { await assertAllowed("signup", email, options.clientIp); }
      catch (error) { if (error instanceof TooManyAttemptsError) return { data: { user: null, session: null }, error: new LocalAuthError(error.message, 429, "over_request_rate_limit") }; throw error; }
      await recordAttempt("signup", email, options.clientIp);
      try {
        const { rows } = await getPool().query<AuthUserRow>(
          `insert into auth.users (email, encrypted_password, raw_user_meta_data)
           values (lower($1), crypt($2, gen_salt('bf', 10)), $3::jsonb) returning ${USER_COLUMNS}`,
          [email.trim(), password, JSON.stringify(cleanSignupMetadata(signUpOptions?.data))],
        );
        const user = toUser(rows[0]);
        return { data: { user, session: startSession(user, rows[0].session_version ?? 1) }, error: null };
      } catch (error) {
        const duplicate = (error as { code?: string }).code === "23505";
        return { data: { user: null, session: null }, error: new LocalAuthError(duplicate ? "User already registered" : "Não foi possível criar a conta.", duplicate ? 422 : 500, duplicate ? "user_already_exists" : "unexpected_failure") };
      }
    },
    async signOut() {
      options.cookies?.set(LOCAL_SESSION_COOKIE, "", { ...sessionCookieOptions, maxAge: 0 });
      return { error: null };
    },
    async updateUser(attributes: { password?: string; data?: Record<string, unknown> }) {
      const payload = await verifyActiveToken(readToken());
      if (!payload) return { data: { user: null }, error: new LocalAuthError("Auth session missing!", 401, "session_not_found") };
      if (attributes.password !== undefined && !validPassword(attributes.password)) {
        return { data: { user: null }, error: new LocalAuthError("A senha precisa ter de 8 a 128 caracteres.", 422, "weak_password") };
      }
      const changingPassword = attributes.password !== undefined;
      const { rows } = await getPool().query<AuthUserRow>(
        `update auth.users set
           encrypted_password = case when $2::text is null then encrypted_password else crypt($2, gen_salt('bf', 10)) end,
           raw_user_meta_data = case when $3::jsonb is null then raw_user_meta_data else raw_user_meta_data || $3::jsonb end,
           session_version = session_version + case when $2::text is null then 0 else 1 end,
           updated_at = now()
         where id = $1 returning ${USER_COLUMNS}`,
        [payload.sub, attributes.password ?? null, attributes.data ? JSON.stringify(cleanSignupMetadata(attributes.data)) : null],
      );
      if (!rows[0]) return { data: { user: null }, error: new LocalAuthError("User not found", 404, "user_not_found") };
      const user = toUser(rows[0]);
      // Senha nova derruba as outras sessões; esta continua com um token da versão nova
      if (changingPassword) { versionCache.delete(user.id); startSession(user, rows[0].session_version ?? 1); }
      return { data: { user }, error: null };
    },
    async resetPasswordForEmail(email: string, resetOptions: { redirectTo?: string } = {}) {
      if (!validEmail(email)) return { data: {}, error: null };
      try { await assertAllowed("reset", email, options.clientIp); }
      catch (error) { if (error instanceof TooManyAttemptsError) return { data: {}, error: new LocalAuthError(error.message, 429, "over_request_rate_limit") }; throw error; }
      await recordAttempt("reset", email, options.clientIp);
      const { rows } = await getPool().query<{ id: string; email: string; session_version: number }>("select id, email, session_version from auth.users where email = lower($1)", [email.trim()]);
      if (rows[0] && process.env.NODE_ENV !== "production") {
        const code = createLocalToken({ sub: rows[0].id, email: rows[0].email, purpose: "recovery", sv: rows[0].session_version }, 3600);
        const base = resetOptions.redirectTo ?? `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/auth/callback?next=/atualizar-senha`;
        // Só em desenvolvimento: sem servidor de e-mail, o link aparece no terminal do `next dev`.
        // Em produção o link NUNCA vai para o log (daria acesso à conta a quem lesse o log).
        console.info(`[auth local] Link de recuperação para ${rows[0].email}: ${base}${base.includes("?") ? "&" : "?"}code=${code}`);
      }
      return { data: {}, error: null };
    },
    async exchangeCodeForSession(code: string) {
      const payload = await verifyActiveToken(code, "recovery");
      const user = payload ? await findUser(payload.sub) : null;
      if (!user) return { data: { user: null, session: null }, error: new LocalAuthError("Invalid or expired code", 400, "bad_code_verifier") };
      return { data: { user, session: startSession(user, payload?.sv ?? 1) }, error: null };
    },
    onAuthStateChange() {
      return { data: { subscription: { unsubscribe() { /* sem eventos no servidor */ } } } };
    },
  };

  const storageRoot = path.resolve(process.cwd(), process.env.LOCAL_STORAGE_DIR ?? ".local-data/storage");
  function objectPath(bucket: string, objectName: string) {
    const target = path.resolve(storageRoot, bucket, objectName);
    if (!target.startsWith(path.resolve(storageRoot, bucket) + path.sep)) throw new Error("Caminho de arquivo inválido.");
    return target;
  }

  const storage = {
    async getBucket(id: string) {
      const { rows } = await getPool().query("select * from storage.buckets where id = $1", [id]);
      return rows[0] ? { data: rows[0], error: null } : { data: null, error: new Error("Bucket not found") };
    },
    async createBucket(id: string, bucketOptions: { public?: boolean; fileSizeLimit?: number; allowedMimeTypes?: string[] } = {}) {
      try {
        await getPool().query(
          "insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ($1, $1, $2, $3, $4)",
          [id, bucketOptions.public ?? false, bucketOptions.fileSizeLimit ?? null, bucketOptions.allowedMimeTypes ?? null],
        );
        return { data: { name: id }, error: null };
      } catch (error) {
        return { data: null, error: new Error((error as { code?: string }).code === "23505" ? "The resource already exists" : String(error)) };
      }
    },
    from(bucket: string) {
      return {
        async upload(objectName: string, body: ArrayBuffer | Uint8Array | Buffer, uploadOptions: { contentType?: string; upsert?: boolean } = {}) {
          try {
            const target = objectPath(bucket, objectName);
            await mkdir(path.dirname(target), { recursive: true });
            await writeFile(target, Buffer.from(body instanceof ArrayBuffer ? new Uint8Array(body) : body), { flag: uploadOptions.upsert ? "w" : "wx" });
            await getPool().query(
              `insert into storage.objects (bucket_id, name, metadata) values ($1, $2, $3::jsonb)
               on conflict (bucket_id, name) do update set metadata = excluded.metadata, updated_at = now()`,
              [bucket, objectName, JSON.stringify({ mimetype: uploadOptions.contentType ?? null })],
            );
            return { data: { path: objectName, fullPath: `${bucket}/${objectName}` }, error: null };
          } catch (error) {
            return { data: null, error: error instanceof Error ? error : new Error(String(error)) };
          }
        },
        async download(objectName: string) {
          try {
            const bytes = await readFile(objectPath(bucket, objectName));
            const { rows } = await getPool().query("select metadata from storage.objects where bucket_id = $1 and name = $2", [bucket, objectName]);
            const type = (rows[0]?.metadata as { mimetype?: string } | undefined)?.mimetype ?? "application/octet-stream";
            return { data: new Blob([new Uint8Array(bytes)], { type }), error: null };
          } catch (error) {
            return { data: null, error: error instanceof Error ? error : new Error(String(error)) };
          }
        },
        async remove(objectNames: string[]) {
          for (const objectName of objectNames) {
            await unlink(objectPath(bucket, objectName)).catch(() => undefined);
            await getPool().query("delete from storage.objects where bucket_id = $1 and name = $2", [bucket, objectName]);
          }
          return { data: objectNames.map((name) => ({ name })), error: null };
        },
      };
    },
  };

  return {
    from(table: string) {
      return new LocalQueryBuilder(executor, "select", table);
    },
    rpc(fn: string, args: Record<string, unknown> = {}) {
      return new LocalQueryBuilder(executor, "rpc", fn, { args });
    },
    auth,
    storage,
    channel() {
      const channel = { on: () => channel, subscribe: () => channel, unsubscribe: async () => "ok" };
      return channel;
    },
    async removeChannel() { return "ok"; },
  };
}

export type LocalServerClient = ReturnType<typeof createLocalServerClient>;
