import "server-only";
import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

export function assertInternalSyncAuth(request: Request) {
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const expected = env.INTERNAL_SYNC_SECRET ?? "";
  if (!expected || supplied.length !== expected.length) throw new Error("UNAUTHORIZED");
  if (!timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) throw new Error("UNAUTHORIZED");
}
