import { createHmac, timingSafeEqual } from "node:crypto";

// Sessão local assinada (HMAC). Só usada quando NEXT_PUBLIC_DATA_BACKEND=local.
export const LOCAL_SESSION_COOKIE = "nexo-local-session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export interface LocalTokenPayload {
  sub: string;
  email: string | null;
  purpose: "session" | "recovery";
  /** Versão da sessão do usuário quando o token foi emitido (auth.users.session_version). */
  sv?: number;
  exp: number;
}

function secret() {
  const value = process.env.LOCAL_AUTH_SECRET;
  if (!value || value.length < 32) throw new Error("LOCAL_AUTH_SECRET deve ter ao menos 32 caracteres.");
  return value;
}

function sign(data: string) {
  return createHmac("sha256", secret()).update(data).digest("base64url");
}

export function createLocalToken(payload: Omit<LocalTokenPayload, "exp">, ttlSeconds = SESSION_TTL_SECONDS) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds })).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifyLocalToken(token: string | undefined | null, purpose: LocalTokenPayload["purpose"] = "session"): LocalTokenPayload | null {
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = Buffer.from(sign(body));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as LocalTokenPayload;
    if (payload.purpose !== purpose || payload.exp * 1000 <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.SESSION_COOKIE_SECURE === "true",
  path: "/",
  maxAge: SESSION_TTL_SECONDS,
};
