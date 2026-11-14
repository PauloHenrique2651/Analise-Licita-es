import { LocalQueryBuilder, type QueryDescriptor, type QueryResult } from "@/lib/local-db/query-builder";

/* Cliente do navegador para homologação local: mesmas chamadas do supabase-js,
   executadas pelas rotas /api/local-db/* com a sessão do cookie httpOnly. */

async function post<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return response.json() as Promise<T>;
}

const executor = (descriptor: QueryDescriptor) => post<QueryResult>("/api/local-db/query", descriptor);

type AuthResult = { data: Record<string, unknown>; error: { message: string; status?: number; code?: string } | null };

function authCall(action: string, payload?: unknown) {
  return post<AuthResult>("/api/local-db/auth", { action, payload }).then((result) => ({
    ...result,
    error: result.error ? Object.assign(new Error(result.error.message), result.error) : null,
  }));
}

type ChangeHandler = () => void;

function createChannel() {
  const handlers = new Map<string, ChangeHandler[]>();
  let timer: ReturnType<typeof setInterval> | null = null;
  let last: Record<string, number> | null = null;

  const channel = {
    on(_type: string, filter: { table?: string }, handler: ChangeHandler) {
      const table = filter.table ?? "*";
      handlers.set(table, [...(handlers.get(table) ?? []), handler]);
      return channel;
    },
    subscribe(callback?: (status: string) => void) {
      const poll = async () => {
        try {
          const tables = [...handlers.keys()].filter((name) => name !== "*");
          const response = await fetch(`/api/local-db/changes?tables=${encodeURIComponent(tables.join(","))}`, { credentials: "same-origin" });
          if (!response.ok) throw new Error(String(response.status));
          const current = (await response.json()) as Record<string, number>;
          if (last === null) callback?.("SUBSCRIBED");
          else for (const table of tables) if (current[table] !== last[table]) handlers.get(table)?.forEach((handler) => handler());
          last = current;
        } catch {
          callback?.("CHANNEL_ERROR");
        }
      };
      void poll();
      timer = setInterval(poll, 5000);
      return channel;
    },
    async unsubscribe() {
      if (timer) clearInterval(timer);
      timer = null;
      return "ok";
    },
  };
  return channel;
}

export function createLocalBrowserClient() {
  return {
    from(table: string) {
      return new LocalQueryBuilder(executor, "select", table);
    },
    rpc(fn: string, args: Record<string, unknown> = {}) {
      return new LocalQueryBuilder(executor, "rpc", fn, { args });
    },
    auth: {
      getUser: () => authCall("getUser"),
      getSession: () => authCall("getSession"),
      signInWithPassword: (credentials: { email: string; password: string }) => authCall("signInWithPassword", credentials),
      signUp: (input: { email: string; password: string; options?: { data?: Record<string, unknown> } }) => authCall("signUp", input),
      signOut: () => authCall("signOut"),
      updateUser: (attributes: { password?: string; data?: Record<string, unknown> }) => authCall("updateUser", attributes),
      resetPasswordForEmail: (email: string, options?: { redirectTo?: string }) => authCall("resetPasswordForEmail", { email, options }),
      onAuthStateChange(callback: (event: string, session: { user: unknown } | null) => void) {
        let active = true;
        void authCall("getSession").then(({ data }) => {
          if (active) callback("INITIAL_SESSION", (data.session as { user: unknown } | null) ?? null);
        });
        return { data: { subscription: { unsubscribe() { active = false; } } } };
      },
    },
    channel: () => createChannel(),
    async removeChannel(channel: { unsubscribe: () => Promise<string> }) {
      return channel.unsubscribe();
    },
  };
}
