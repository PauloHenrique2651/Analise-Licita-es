import "server-only";
import type { DatabaseError } from "pg";
import { withIdentity, type DbIdentity } from "@/lib/local-db/pool";
import { getSchema, type SchemaInfo } from "@/lib/local-db/schema";
import type { QueryDescriptor, QueryFilter, QueryResult } from "@/lib/local-db/query-builder";

/* Mini-PostgREST: traduz o descritor do construtor em SQL parametrizado. */

type SelectNode =
  | { type: "column"; name: string; alias: string }
  | { type: "star" }
  | { type: "embed"; name: string; alias: string; inner: boolean; children: SelectNode[] };

const IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function ident(name: string) {
  if (!IDENT.test(name)) throw new Error(`Identificador inválido: ${name}`);
  return `"${name}"`;
}

export function parseSelect(input: string): SelectNode[] {
  let index = 0;
  const source = input.replace(/\s+/g, "");

  function parseList(): SelectNode[] {
    const nodes: SelectNode[] = [];
    while (index < source.length && source[index] !== ")") {
      nodes.push(parseItem());
      if (source[index] === ",") index += 1;
    }
    return nodes;
  }

  function readToken() {
    const start = index;
    while (index < source.length && !",()".includes(source[index])) index += 1;
    return source.slice(start, index);
  }

  function parseItem(): SelectNode {
    const token = readToken();
    if (token === "*") return { type: "star" };
    let alias: string | null = null;
    let body = token;
    const colon = token.indexOf(":");
    if (colon > 0 && token[colon + 1] !== ":") {
      alias = token.slice(0, colon);
      body = token.slice(colon + 1);
    }
    body = body.split("::")[0];
    if (source[index] === "(") {
      index += 1;
      const children = parseList();
      index += 1;
      const [name, ...hints] = body.split("!");
      const inner = hints.includes("inner");
      return { type: "embed", name, alias: alias ?? name, inner, children: children.length ? children : [{ type: "star" }] };
    }
    return { type: "column", name: body, alias: alias ?? body };
  }

  const nodes = parseList();
  return nodes.length ? nodes : [{ type: "star" }];
}

interface Relation { refTable: string; cardinality: "one" | "many"; join: (parent: string, child: string) => string }

function resolveRelation(schema: SchemaInfo, table: string, embed: string): Relation {
  const outgoing = schema.foreignKeys.find((fk) => fk.table === table && fk.refTable === embed);
  if (outgoing) {
    return {
      refTable: embed,
      cardinality: "one",
      join: (parent, child) => outgoing.columns.map((column, i) => `${child}.${ident(outgoing.refColumns[i])} = ${parent}.${ident(column)}`).join(" and "),
    };
  }
  const incoming = schema.foreignKeys.find((fk) => fk.table === embed && fk.refTable === table);
  if (incoming) {
    return {
      refTable: embed,
      cardinality: "many",
      join: (parent, child) => incoming.columns.map((column, i) => `${child}.${ident(column)} = ${parent}.${ident(incoming.refColumns[i])}`).join(" and "),
    };
  }
  throw new Error(`Relação não encontrada entre ${table} e ${embed}.`);
}

class SqlContext {
  params: unknown[] = [];
  private aliasCounter = 0;
  constructor(readonly schema: SchemaInfo) {}
  param(value: unknown) { this.params.push(value); return `$${this.params.length}`; }
  nextAlias() { this.aliasCounter += 1; return `t${this.aliasCounter}`; }
}

function splitTopLevel(input: string) {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of input) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) { parts.push(current); current = ""; continue; }
    current += char;
  }
  if (current) parts.push(current);
  return parts;
}

function compileCondition(ctx: SqlContext, alias: string, column: string, op: string, value: unknown, negate: boolean) {
  const col = `${alias}.${ident(column)}`;
  let sql: string;
  switch (op) {
    case "eq": sql = `${col} = ${ctx.param(value)}`; break;
    case "neq": sql = `${col} <> ${ctx.param(value)}`; break;
    case "gt": sql = `${col} > ${ctx.param(value)}`; break;
    case "gte": sql = `${col} >= ${ctx.param(value)}`; break;
    case "lt": sql = `${col} < ${ctx.param(value)}`; break;
    case "lte": sql = `${col} <= ${ctx.param(value)}`; break;
    case "like": sql = `${col} like ${ctx.param(String(value).replaceAll("*", "%"))}`; break;
    case "ilike": sql = `${col} ilike ${ctx.param(String(value).replaceAll("*", "%"))}`; break;
    case "is": {
      const normalized = value === null || value === "null" ? "null" : value === true || value === "true" ? "true" : value === false || value === "false" ? "false" : null;
      if (!normalized) throw new Error("Valor inválido para is().");
      sql = `${col} is ${normalized}`;
      break;
    }
    case "in": {
      const list = Array.isArray(value) ? value : String(value).replace(/^\(|\)$/g, "").split(",").map((item) => item.replace(/^"|"$/g, ""));
      sql = list.length ? `${col} = any(${ctx.param(list)})` : "false";
      break;
    }
    case "contains":
      sql = Array.isArray(value) ? `${col} @> ${ctx.param(value)}` : `${col} @> ${ctx.param(JSON.stringify(value))}::jsonb`;
      break;
    case "containedBy":
      sql = Array.isArray(value) ? `${col} <@ ${ctx.param(value)}` : `${col} <@ ${ctx.param(JSON.stringify(value))}::jsonb`;
      break;
    default: throw new Error(`Operador não suportado: ${op}`);
  }
  return negate ? `not (${sql})` : sql;
}

function compileOrExpression(ctx: SqlContext, alias: string, expression: string): string {
  const parts = splitTopLevel(expression).map((part) => {
    const nested = part.match(/^(and|or)\((.*)\)$/);
    if (nested) {
      const inner = splitTopLevel(nested[2]).map((piece) => compileOrExpression(ctx, alias, piece));
      return `(${inner.join(nested[1] === "and" ? " and " : " or ")})`;
    }
    const [column, ...rest] = part.split(".");
    let negate = false;
    if (rest[0] === "not") { negate = true; rest.shift(); }
    const op = rest.shift() ?? "eq";
    const value = rest.join(".");
    return compileCondition(ctx, alias, column, op, value, negate);
  });
  return `(${parts.join(" or ")})`;
}

/** Separa filtros por caminho de recurso ("" = tabela principal, "a.b" = recurso embutido). */
function groupFilters(filters: QueryFilter[]) {
  const groups = new Map<string, QueryFilter[]>();
  for (const filter of filters) {
    let path = "";
    let normalized: QueryFilter = filter;
    if (filter.kind === "op") {
      const pieces = filter.column.split(".");
      const column = pieces.pop()!;
      path = pieces.join(".");
      normalized = { ...filter, column };
    } else {
      path = filter.foreignTable ?? "";
    }
    if (!groups.has(path)) groups.set(path, []);
    groups.get(path)!.push(normalized);
  }
  return groups;
}

function compileFilters(ctx: SqlContext, alias: string, filters: QueryFilter[] | undefined) {
  return (filters ?? []).map((filter) => filter.kind === "op"
    ? compileCondition(ctx, alias, filter.column, filter.op, filter.value, Boolean(filter.negate))
    : compileOrExpression(ctx, alias, filter.expression));
}

interface CompiledRow { expression: string; conditions: string[] }

function jsonObject(pairs: string[]) {
  if (!pairs.length) return "'{}'::jsonb";
  const chunks: string[] = [];
  for (let i = 0; i < pairs.length; i += 40) chunks.push(`jsonb_build_object(${pairs.slice(i, i + 40).join(", ")})`);
  return chunks.join(" || ");
}

/** Gera a expressão jsonb de uma linha (colunas + recursos embutidos) e as condições !inner. */
function compileRow(ctx: SqlContext, table: string, alias: string, nodes: SelectNode[], filters: Map<string, QueryFilter[]>, path: string): CompiledRow {
  const pairs: string[] = [];
  const conditions: string[] = [];
  let star = false;
  for (const node of nodes) {
    if (node.type === "star") { star = true; continue; }
    if (node.type === "column") {
      pairs.push(`'${node.alias.replaceAll("'", "''")}', ${alias}.${ident(node.name)}`);
      continue;
    }
    const relation = resolveRelation(ctx.schema, table, node.name);
    const childAlias = ctx.nextAlias();
    const childPath = path ? `${path}.${node.alias}` : node.alias;
    const child = compileRow(ctx, relation.refTable, childAlias, node.children, filters, childPath);
    const where = [relation.join(alias, childAlias), ...compileFilters(ctx, childAlias, filters.get(childPath)), ...child.conditions].join(" and ");
    const from = `from public.${ident(relation.refTable)} ${childAlias} where ${where}`;
    const value = relation.cardinality === "one"
      ? `(select ${child.expression} ${from} limit 1)`
      : `coalesce((select jsonb_agg(${child.expression}) ${from}), '[]'::jsonb)`;
    pairs.push(`'${node.alias.replaceAll("'", "''")}', ${value}`);
    if (node.inner) conditions.push(`exists (select 1 ${from})`);
  }
  const object = jsonObject(pairs);
  const expression = star ? (pairs.length ? `to_jsonb(${alias}.*) || ${object}` : `to_jsonb(${alias}.*)`) : object;
  return { expression, conditions };
}

function serializeValue(udt: string | undefined, value: unknown) {
  if (value === null || value === undefined) return null;
  if (udt === "json" || udt === "jsonb") return JSON.stringify(value);
  if (udt?.startsWith("_")) return value;
  if (typeof value === "object" && !(value instanceof Date) && !Array.isArray(value)) return JSON.stringify(value);
  return value;
}

function orderClause(order: QueryDescriptor["order"], alias: string) {
  if (!order.length) return "";
  return ` order by ${order.map((item) => {
    const nulls = item.nullsFirst === undefined ? "" : item.nullsFirst ? " nulls first" : " nulls last";
    return `${alias}.${ident(item.column)} ${item.ascending ? "asc" : "desc"}${nulls}`;
  }).join(", ")}`;
}

function pageClause(descriptor: QueryDescriptor, ctx: SqlContext) {
  let sql = "";
  if (descriptor.limit !== undefined) sql += ` limit ${ctx.param(descriptor.limit)}`;
  if (descriptor.offset !== undefined) sql += ` offset ${ctx.param(descriptor.offset)}`;
  return sql;
}

function finalize(descriptor: QueryDescriptor, rows: unknown[] | null, count: number | null, status = 200): QueryResult {
  if (rows === null) return { data: null, error: null, count, status, statusText: "OK" };
  if (descriptor.single) {
    if (rows.length === 1) return { data: rows[0], error: null, count, status, statusText: "OK" };
    if (rows.length === 0 && descriptor.single === "maybeSingle") return { data: null, error: null, count, status, statusText: "OK" };
    return {
      data: null, count, status: 406, statusText: "Not Acceptable",
      error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: `The result contains ${rows.length} rows`, hint: null },
    };
  }
  return { data: rows, error: null, count, status, statusText: "OK" };
}

/**
 * Só dados coletados das fontes públicas (mudam por sincronização, toleram segundos de atraso) vão para a réplica.
 * Dados da empresa (oportunidades, links do portal, mensagens, documentos) ficam no primário: quem grava precisa ler o que gravou.
 */
const REPLICA_TABLES = new Set([
  "procurements", "procurement_items", "procurement_sources", "organizations", "results", "suppliers", "price_records",
  "catalog_items", "products", "categories", "brands", "manufacturers", "cities", "states", "sources",
  "product_groups", "product_group_states", "market_summary", "product_market_summary", "organization_purchase_summary", "company_performance",
]);
const RPC_ALLOWED: Record<"anon" | "authenticated", Set<string>> = {
  anon: new Set(["get_public_portal_snapshot", "send_public_portal_message"]),
  authenticated: new Set(["search_procurements", "get_daily_opportunity_panel", "search_catalog_items", "procurements_by_city", "search_product_groups", "product_group_niches", "product_group_procurements", "product_group_variants", "product_group_suppliers", "product_group_winning_prices", "product_price_position", "product_clients_position", "supplier_product_groups", "get_product_group", "get_public_portal_snapshot", "send_public_portal_message"]),
};
const REPLICA_RPCS = new Set(["search_procurements", "get_daily_opportunity_panel", "search_catalog_items", "procurements_by_city", "search_product_groups", "product_group_niches", "product_group_procurements", "product_group_variants", "product_group_suppliers", "product_group_winning_prices", "product_price_position", "supplier_product_groups", "get_product_group"]);

async function execute(descriptor: QueryDescriptor, identity: DbIdentity): Promise<QueryResult> {
  const schema = await getSchema();
  const ctx = new SqlContext(schema);
  const target = descriptor.target;

  if (descriptor.kind === "rpc") {
    // Usuários e visitantes só chamam as funções que o app usa; o resto (crypt, set_limit, recálculos pesados...) é negado
    // aqui, antes do banco, além das permissões do próprio banco (local-db/security.sql).
    if (identity.role !== "service_role" && !RPC_ALLOWED[identity.role].has(target)) {
      return { data: null, count: null, status: 404, statusText: "Not Found", error: { message: "Função não disponível.", code: "PGRST202" } };
    }
    const fn = schema.functions.get(target);
    if (!fn) throw new Error(`Função não encontrada: ${target}`);
    const args = Object.entries(descriptor.args ?? {}).filter(([, value]) => value !== undefined)
      .map(([name, value]) => `${ident(name)} => ${ctx.param(typeof value === "object" && value !== null && !Array.isArray(value) ? JSON.stringify(value) : value)}`);
    const call = `public.${ident(target)}(${args.join(", ")})`;
    const replica = REPLICA_RPCS.has(target);
    return withIdentity(identity, async (client) => {
      if (fn.returnsSet || fn.composite) {
        const result = await client.query<{ r: unknown }>(`select to_jsonb(_r) as r from ${call} _r`, ctx.params);
        const rows = result.rows.map((row) => row.r);
        if (fn.returnsSet) return finalize(descriptor, rows, null);
        return { data: rows[0] ?? null, error: null, count: null, status: 200, statusText: "OK" };
      }
      const result = await client.query<{ r: unknown }>(`select ${call} as r`, ctx.params);
      return { data: fn.isVoid ? null : result.rows[0]?.r ?? null, error: null, count: null, status: 200, statusText: "OK" };
    }, { replica });
  }

  const filters = groupFilters(descriptor.filters);
  const nodes = parseSelect(descriptor.select ?? "*");

  if (descriptor.kind === "select") {
    const row = compileRow(ctx, target, "t0", nodes, filters, "");
    const where = [...compileFilters(ctx, "t0", filters.get("")), ...row.conditions];
    const whereSql = where.length ? ` where ${where.join(" and ")}` : "";
    const countParams = [...ctx.params];
    const countSql = `select count(*)::bigint as c from public.${ident(target)} t0${whereSql}`;
    const dataSql = `select ${row.expression} as r from public.${ident(target)} t0${whereSql}${orderClause(descriptor.order, "t0")}${pageClause(descriptor, ctx)}`;
    return withIdentity(identity, async (client) => {
      const count = descriptor.count ? Number((await client.query<{ c: string }>(countSql, countParams)).rows[0]?.c ?? 0) : null;
      if (descriptor.head) return finalize({ ...descriptor, single: undefined }, null, count);
      const result = await client.query<{ r: unknown }>(dataSql, ctx.params);
      return finalize(descriptor, result.rows.map((item) => item.r), count);
    }, { replica: REPLICA_TABLES.has(target) });
  }

  const columnTypes = schema.columns.get(target);
  if (!columnTypes) throw new Error(`Tabela não encontrada: ${target}`);
  let mutation: string;

  if (descriptor.kind === "insert" || descriptor.kind === "upsert") {
    const rows = (Array.isArray(descriptor.values) ? descriptor.values : [descriptor.values ?? {}]) as Array<Record<string, unknown>>;
    const columns = [...new Set(rows.flatMap((item) => Object.keys(item).filter((key) => item[key] !== undefined)))];
    const values = rows.map((item) => `(${columns.map((column) => item[column] === undefined ? "default" : `${ctx.param(serializeValue(columnTypes.get(column), item[column]))}`).join(", ")})`);
    mutation = columns.length
      ? `insert into public.${ident(target)} as t0 (${columns.map(ident).join(", ")}) values ${values.join(", ")}`
      : `insert into public.${ident(target)} as t0 default values`;
    if (descriptor.kind === "upsert") {
      const conflict = descriptor.onConflict?.split(",").map((item) => item.trim()).filter(Boolean) ?? schema.primaryKeys.get(target) ?? [];
      const updates = columns.filter((column) => !conflict.includes(column));
      mutation += ` on conflict (${conflict.map(ident).join(", ")}) `;
      mutation += descriptor.ignoreDuplicates || !updates.length ? "do nothing" : `do update set ${updates.map((column) => `${ident(column)} = excluded.${ident(column)}`).join(", ")}`;
    }
  } else if (descriptor.kind === "update") {
    const values = Object.entries(descriptor.values ?? {}).filter(([, value]) => value !== undefined);
    if (!values.length) return { data: descriptor.returning ? [] : null, error: null, count: null, status: 204, statusText: "No Content" };
    const where = compileFilters(ctx, "t0", filters.get(""));
    mutation = `update public.${ident(target)} as t0 set ${values.map(([column, value]) => `${ident(column)} = ${ctx.param(serializeValue(columnTypes.get(column), value))}`).join(", ")}${where.length ? ` where ${where.join(" and ")}` : ""}`;
  } else {
    const where = compileFilters(ctx, "t0", filters.get(""));
    mutation = `delete from public.${ident(target)} as t0${where.length ? ` where ${where.join(" and ")}` : ""}`;
  }

  if (!descriptor.returning) {
    return withIdentity(identity, async (client) => {
      await client.query(mutation, ctx.params);
      return { data: null, error: null, count: null, status: descriptor.kind === "insert" ? 201 : 204, statusText: "OK" };
    });
  }
  const row = compileRow(ctx, target, "t0", nodes, filters, "");
  const sql = `with _m as (${mutation} returning t0.*) select ${row.expression} as r from _m t0`;
  return withIdentity(identity, async (client) => {
    const result = await client.query<{ r: unknown }>(sql, ctx.params);
    return finalize(descriptor, result.rows.map((item) => item.r), null, descriptor.kind === "insert" ? 201 : 200);
  });
}

export async function runQuery(descriptor: QueryDescriptor, identity: DbIdentity): Promise<QueryResult> {
  try {
    return await execute(descriptor, identity);
  } catch (error) {
    const pgError = error as Partial<DatabaseError>;
    return {
      data: null, count: null, status: 400, statusText: "Bad Request",
      error: { message: pgError.message ?? String(error), code: pgError.code, details: pgError.detail ?? null, hint: pgError.hint ?? null },
    };
  }
}
