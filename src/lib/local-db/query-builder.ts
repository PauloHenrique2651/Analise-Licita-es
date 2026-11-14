// Construtor de consultas compatível com o subconjunto do supabase-js usado no app.
// Isomórfico: produz um descritor serializável e delega a execução a um executor
// (Postgres direto no servidor ou rota /api/local-db/query no navegador).

export type FilterOp =
  | "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "like" | "ilike" | "is" | "in" | "contains" | "containedBy";

export type QueryFilter =
  | { kind: "op"; column: string; op: FilterOp; value: unknown; negate?: boolean }
  | { kind: "or"; expression: string; foreignTable?: string };

export interface QueryOrder { column: string; ascending: boolean; nullsFirst?: boolean }

export interface QueryDescriptor {
  kind: "select" | "insert" | "upsert" | "update" | "delete" | "rpc";
  target: string;
  select?: string;
  returning?: boolean;
  values?: Record<string, unknown> | Array<Record<string, unknown>>;
  onConflict?: string;
  ignoreDuplicates?: boolean;
  args?: Record<string, unknown>;
  filters: QueryFilter[];
  order: QueryOrder[];
  limit?: number;
  offset?: number;
  single?: "single" | "maybeSingle";
  count?: "exact" | "planned" | "estimated";
  head?: boolean;
}

export interface LocalQueryError {
  message: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
}

export interface QueryResult<T = unknown> {
  data: T | null;
  error: LocalQueryError | null;
  count: number | null;
  status: number;
  statusText: string;
}

export type QueryExecutor = (descriptor: QueryDescriptor) => Promise<QueryResult>;

export class PostgrestLikeError extends Error {
  code?: string;
  details?: string | null;
  hint?: string | null;
  constructor(error: LocalQueryError) {
    super(error.message);
    this.name = "PostgrestError";
    this.code = error.code;
    this.details = error.details ?? null;
    this.hint = error.hint ?? null;
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export class LocalQueryBuilder implements PromiseLike<QueryResult<any>> {
  private descriptor: QueryDescriptor;
  private shouldThrow = false;

  constructor(private readonly executor: QueryExecutor, kind: QueryDescriptor["kind"], target: string, extra: Partial<QueryDescriptor> = {}) {
    this.descriptor = { kind, target, filters: [], order: [], ...extra };
  }

  select(columns = "*", options: { count?: "exact" | "planned" | "estimated"; head?: boolean } = {}) {
    if (this.descriptor.kind === "select") {
      this.descriptor.select = columns;
      this.descriptor.count = options.count;
      this.descriptor.head = options.head;
    } else {
      this.descriptor.select = columns;
      this.descriptor.returning = true;
    }
    return this;
  }

  insert(values: Record<string, unknown> | Array<Record<string, unknown>>) {
    this.descriptor.kind = "insert";
    this.descriptor.values = values;
    return this;
  }

  upsert(values: Record<string, unknown> | Array<Record<string, unknown>>, options: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
    this.descriptor.kind = "upsert";
    this.descriptor.values = values;
    this.descriptor.onConflict = options.onConflict;
    this.descriptor.ignoreDuplicates = options.ignoreDuplicates;
    return this;
  }

  update(values: Record<string, unknown>) {
    this.descriptor.kind = "update";
    this.descriptor.values = values;
    return this;
  }

  delete() {
    this.descriptor.kind = "delete";
    return this;
  }

  private op(column: string, op: FilterOp, value: unknown, negate = false) {
    this.descriptor.filters.push({ kind: "op", column, op, value, negate });
    return this;
  }

  eq(column: string, value: unknown) { return this.op(column, "eq", value); }
  neq(column: string, value: unknown) { return this.op(column, "neq", value); }
  gt(column: string, value: unknown) { return this.op(column, "gt", value); }
  gte(column: string, value: unknown) { return this.op(column, "gte", value); }
  lt(column: string, value: unknown) { return this.op(column, "lt", value); }
  lte(column: string, value: unknown) { return this.op(column, "lte", value); }
  like(column: string, value: string) { return this.op(column, "like", value); }
  ilike(column: string, value: string) { return this.op(column, "ilike", value); }
  is(column: string, value: null | boolean) { return this.op(column, "is", value); }
  in(column: string, values: readonly unknown[]) { return this.op(column, "in", [...values]); }
  contains(column: string, value: unknown) { return this.op(column, "contains", value); }
  containedBy(column: string, value: unknown) { return this.op(column, "containedBy", value); }

  not(column: string, operator: string, value: unknown) {
    return this.op(column, normalizeOp(operator), value, true);
  }

  filter(column: string, operator: string, value: unknown) {
    return this.op(column, normalizeOp(operator), value);
  }

  match(query: Record<string, unknown>) {
    for (const [column, value] of Object.entries(query)) this.op(column, "eq", value);
    return this;
  }

  or(expression: string, options: { foreignTable?: string; referencedTable?: string } = {}) {
    this.descriptor.filters.push({ kind: "or", expression, foreignTable: options.referencedTable ?? options.foreignTable });
    return this;
  }

  order(column: string, options: { ascending?: boolean; nullsFirst?: boolean } = {}) {
    this.descriptor.order.push({ column, ascending: options.ascending ?? true, nullsFirst: options.nullsFirst });
    return this;
  }

  limit(count: number) { this.descriptor.limit = count; return this; }

  range(from: number, to: number) {
    this.descriptor.offset = from;
    this.descriptor.limit = to - from + 1;
    return this;
  }

  single() { this.descriptor.single = "single"; return this; }
  maybeSingle() { this.descriptor.single = "maybeSingle"; return this; }
  returns() { return this; }
  abortSignal() { return this; }
  throwOnError() { this.shouldThrow = true; return this; }

  then<TResult1 = QueryResult<any>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<any>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    const run = async () => {
      let result: QueryResult;
      try {
        result = await this.executor(this.descriptor);
      } catch (error) {
        result = { data: null, count: null, status: 500, statusText: "Error", error: { message: error instanceof Error ? error.message : String(error) } };
      }
      if (result.error) {
        const wrapped = new PostgrestLikeError(result.error);
        if (this.shouldThrow) throw wrapped;
        return { ...result, error: wrapped };
      }
      return result;
    };
    return run().then(onfulfilled, onrejected);
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function normalizeOp(operator: string): FilterOp {
  const allowed: FilterOp[] = ["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "is", "in", "contains", "containedBy"];
  const alias: Record<string, FilterOp> = { cs: "contains", cd: "containedBy" };
  const op = (alias[operator] ?? operator) as FilterOp;
  if (!allowed.includes(op)) throw new Error(`Operador não suportado no banco local: ${operator}`);
  return op;
}
