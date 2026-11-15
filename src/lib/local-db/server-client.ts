import "server-only";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { runQuery } from "@/lib/local-db/engine";
import { getPool, type DbIdentity } from "@/lib/local-db/pool";
import { LocalQueryBuilder } from "@/lib/local-db/query-builder";
import {
  createLocalToken, LOCAL_SESSION_COOKIE, sessionCookieOptions, SESSION_TTL_SECONDS, verifyLocalToken,
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

const USER_COLUMNS = "id, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at, last_sign_in_at";

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
  cookies?: CookieAdapter;
  accessToken?: string;
  admin?: boolean;
}

export function createLocalServerClient(options: LocalClientOptions = {}) {
  const readToken = () => options.accessToken ?? options.cookies?.get(LOCAL_SESSION_COOKIE);

  async function identity(): Promise<DbIdentity> {
    if (options.admin) return { role: "service_role" };
    const payload = verifyLocalToken(readToken());
    return payload ? { role: "authenticated", userId: payload.sub, email: payload.email } : { role: "anon" };
  }

  const executor = async (descriptor: Parameters<typeof runQuery>[0]) => runQuery(descriptor, await identity());

  function startSession(user: LocalUser) {
    const token = createLocalToken({ sub: user.id, email: user.email, purpose: "session" });
    options.cookies?.set(LOCAL_SESSION_COOKIE, token, sessionCookieOptions);
    return sessionFor(user, token);
  }

  const auth = {
    async getUser(token?: string) {
      const payload = verifyLocalToken(token ?? readToken());
      const user = payload ? await findUser(payload.sub) : null;
      if (!user) return { data: { user: null }, error: new LocalAuthError("Auth session missing!", 401, "session_not_found") };
      return { data: { user }, error: null };
    },
    async getSession() {
      const token = readToken();
      const payload = verifyLocalToken(token);
      const user = payload ? await findUser(payload.sub) : null;
      return { data: { session: user && token ? sessionFor(user, token) : null }, error: null };
    },
    async signInWithPassword({ email, password }: { email: string; password: string }) {
      const { rows } = await getPool().query<AuthUserRow>(
        `update auth.users set last_sign_in_at = now()
         where email = lower($1) and encrypted_password is not null and encrypted_password = crypt($2, encrypted_password)
         returning ${USER_COLUMNS}`,
        [email.trim(), password],
      );
      if (!rows[0]) return { data: { user: null, session: null }, error: new LocalAuthError("Invalid login credentials", 400, "invalid_credentials") };
      const user = toUser(rows[0]);
      return { data: { user, session: startSession(user) }, error: null };
    },
    async signUp({ email, password, options: signUpOptions }: { email: string; password: string; options?: { data?: Record<string, unknown> } }) {
      try {
        const { rows } = await getPool().query<AuthUserRow>(
          `insert into auth.users (email, encrypted_password, raw_user_meta_data)
           values (lower($1), crypt($2, gen_salt('bf')), $3::jsonb) returning ${USER_COLUMNS}`,
          [email.trim(), password, JSON.stringify(signUpOptions?.data ?? {})],
        );
        const user = toUser(rows[0]);
        return { data: { user, session: startSession(user) }, error: null };
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
      const payload = verifyLocalToken(readToken());
      if (!payload) return { data: { user: null }, error: new LocalAuthError("Auth session missing!", 401, "session_not_found") };
      const { rows } = await getPool().query<AuthUserRow>(
        `update auth.users set
           encrypted_password = case when $2::text is null then encrypted_password else crypt($2, gen_salt('bf')) end,
           raw_user_meta_data = case when $3::jsonb is null then raw_user_meta_data else $3::jsonb end,
           updated_at = now()
         where id = $1 returning ${USER_COLUMNS}`,
        [payload.sub, attributes.password ?? null, attributes.data ? JSON.stringify(attributes.data) : null],
      );
      return rows[0] ? { data: { user: toUser(rows[0]) }, error: null } : { data: { user: null }, error: new LocalAuthError("User not found", 404, "user_not_found") };
    },
    async resetPasswordForEmail(email: string, resetOptions: { redirectTo?: string } = {}) {
      const { rows } = await getPool().query<{ id: string; email: string }>("select id, email from auth.users where email = lower($1)", [email.trim()]);
      if (rows[0]) {
        const code = createLocalToken({ sub: rows[0].id, email: rows[0].email, purpose: "recovery" }, 3600);
        const base = resetOptions.redirectTo ?? `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/auth/callback?next=/atualizar-senha`;
        // Sem servidor de e-mail na homologação: o link de recuperação aparece no terminal do `next dev`.
        console.info(`[auth local] Link de recuperação para ${rows[0].email}: ${base}${base.includes("?") ? "&" : "?"}code=${code}`);
      }
      return { data: {}, error: null };
    },
    async exchangeCodeForSession(code: string) {
      const payload = verifyLocalToken(code, "recovery");
      const user = payload ? await findUser(payload.sub) : null;
      if (!user) return { data: { user: null, session: null }, error: new LocalAuthError("Invalid or expired code", 400, "bad_code_verifier") };
      return { data: { user, session: startSession(user) }, error: null };
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
