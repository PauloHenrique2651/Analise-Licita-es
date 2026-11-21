import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getCoverage, type CoverageDay } from "@/services/numbers-service";

/** Piso da carga histórica (igual ao NEXO_FLOOR do servidor). */
export const HISTORY_FLOOR = "2025-01-01";

export type CollectorStatus = "ok" | "stale" | "error";
export type Collector = {
  key: string; label: string; detail: string; status: CollectorStatus; lastSuccessAt: string | null;
  /** 0 a 100, só para a carga histórica. */
  progress: number | null; error: string | null; lastAgo: string;
};
export type LogGroup = {
  key: string; level: "error" | "warning"; count: number; lastAt: string; lastAgo: string; example: string; title: string; meaning: string; action: string | null; endpoint: string | null;
};
/** "há 5 min", "há 2 h": calculado no servidor (a página não chama o relógio). */
export function ago(iso: string | null, now = Date.now()) {
  if (!iso) return "nunca";
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  return minutes < 1 ? "agora" : minutes < 60 ? `há ${minutes} min` : minutes < 1440 ? `há ${Math.round(minutes / 60)} h` : `há ${Math.round(minutes / 1440)} d`;
}
export type CoverageModality = { day: string; modality: number; pncp: number; ours: number };

const DAY_MS = 86_400_000;
const brDate = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
const fmtDay = (value: string) => brDate.format(new Date(`${value}T12:00:00Z`));

/** Traduz a mensagem técnica de um log: o que significa e se alguém precisa agir. */
const EXPLANATIONS: Array<{ test: RegExp; title: string; meaning: string; action: string | null }> = [
  { test: /HTTP 429|429/i, title: "Fonte limitou as consultas (429)", meaning: "O portal público pede para diminuir o ritmo. A coleta espera e tenta de novo sozinha.", action: null },
  { test: /HTTP 503|HTTP 502|HTTP 504/i, title: "Fonte fora do ar ou instável (5xx)", meaning: "O serviço do portal falhou naquele momento. A coleta repete depois; a conferência com o PNCP fecha qualquer buraco.", action: null },
  { test: /HTTP 400/i, title: "Consulta recusada pela fonte (400)", meaning: "O portal recusou um parâmetro daquela consulta. Raro; vale olhar se repetir muito.", action: "Verificar se o portal mudou a API." },
  { test: /timeout|aborted/i, title: "Fonte demorou demais", meaning: "A consulta passou do tempo limite. A coleta tenta de novo no próximo ciclo.", action: null },
  { test: /fetch failed/i, title: "Falha de conexão com a fonte", meaning: "Não foi possível falar com o portal naquele instante. Repete sozinha.", action: null },
  { test: /itens indispon|items/i, title: "Itens ainda não publicados na fonte", meaning: "A licitação já existe, mas o portal ainda não liberou os itens. Eles entram na próxima passada.", action: null },
  { test: /resultados homologados/i, title: "Resultados ainda não publicados", meaning: "A licitação ainda não tem resultado homologado na fonte.", action: null },
  { test: /duplicate key/i, title: "Registro repetido na fonte", meaning: "A mesma licitação ou item veio duas vezes. A gravação pula o repetido e segue.", action: null },
  { test: /cities_state_code_fkey|violates foreign key/i, title: "Estado ou município fora da lista", meaning: "A fonte mandou uma UF que não existe no cadastro (ex.: exterior). A licitação é gravada sem o município.", action: null },
];

function describe(message: string) {
  const hit = EXPLANATIONS.find((entry) => entry.test.test(message));
  return hit ?? { title: message.slice(0, 80), meaning: "Erro sem explicação cadastrada.", action: "Olhar o exemplo abaixo." };
}

/** Agrupa mensagens que só diferem por números e identificadores. */
const normalize = (message: string) => message.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, "#").replace(/\d+/g, "#").slice(0, 140);

const COLLECTORS: Array<{ key: string; label: string; kind: "mirror" | "history" | "results" | "reconcile"; detail: string }> = [
  { key: "PNCP", label: "Espelho do PNCP", kind: "mirror", detail: "Publicações de hoje, em tempo real" },
  { key: "COMPRAS_GOV_RESULTS", label: "Espelho do Compras.gov", kind: "mirror", detail: "Contratações e resultados recentes" },
  { key: "BACKFILL_PNCP", label: "Histórico do PNCP", kind: "history", detail: "Carga de trás para frente até 01/01/2025" },
  { key: "BACKFILL_COMPRAS_GOV", label: "Histórico do Compras.gov", kind: "history", detail: "Carga de trás para frente até 01/01/2025" },
  { key: "BACKFILL_PNCP_ITEMS", label: "Itens do histórico (PNCP)", kind: "history", detail: "Busca os itens das licitações já carregadas" },
  { key: "BACKFILL_COMPRAS_GOV_RESULTS", label: "Resultados do histórico (Compras.gov)", kind: "history", detail: "Resultados homologados do período" },
  { key: "RECONCILE_PNCP", label: "Conferência com o PNCP", kind: "reconcile", detail: "Compara o total oficial por dia e modalidade e busca o que faltar" },
];

export async function getAdminOverview() {
  const supabase = await createClient();
  const empty = { today: "", yesterday: "", lastCheckAgo: null as string | null, collectors: [] as Collector[], coverage: [] as CoverageDay[], modalities: [] as CoverageModality[], logs: [] as LogGroup[], logTotals: { error: 0, warning: 0 }, estimates: {} as Record<string, number>, runs: [] as Array<Record<string, unknown>> };
  if (!supabase) return empty;
  const since24h = new Date(Date.now() - DAY_MS).toISOString();
  const sinceDay = new Date(Date.now() - 14 * DAY_MS).toISOString().slice(0, 10);
  const [stateResult, coverage, modalityResult, logResult, estimateResult, runResult] = await Promise.all([
    supabase.from("procurement_sync_state").select("provider,last_success_at,last_error,last_cursor,metadata,consecutive_failures").limit(60),
    getCoverage(14),
    supabase.from("pncp_coverage").select("day,modality,pncp_total,our_total").gte("day", sinceDay).limit(5000),
    supabase.from("sync_logs").select("level,message,endpoint,created_at").in("level", ["error", "warning"]).gte("created_at", since24h).order("created_at", { ascending: false }).limit(4000),
    supabase.rpc("table_estimates", { p_tables: ["procurements", "procurement_items", "organizations", "products", "suppliers", "results", "price_records", "product_groups"] }),
    supabase.from("imports").select("id,endpoint,started_at,finished_at,status,processed_count,error_count,sources(name)").order("started_at", { ascending: false }).limit(12),
  ]);

  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  const stateByKey = new Map((stateResult.data ?? []).map((row) => [String(row.provider), row]));
  const collectors: Collector[] = COLLECTORS.flatMap((entry) => {
    const row = stateByKey.get(entry.key);
    if (!row) return [];
    const metadata = (row.metadata ?? {}) as { endDate?: string; nextDay?: string; rounds?: number };
    const last = row.last_success_at ? String(row.last_success_at) : null;
    const age = last ? now - new Date(last).getTime() : Number.POSITIVE_INFINITY;
    const failing = Number(row.consecutive_failures ?? 0) >= 3;
    const limit = entry.kind === "mirror" ? 20 * 60_000 : 60 * 60_000;
    let detail = entry.detail;
    let progress: number | null = null;
    const cursor = metadata.endDate ?? (entry.kind === "reconcile" ? metadata.nextDay : undefined);
    if (entry.kind === "history" && cursor) {
      const total = (new Date(`${today}T12:00:00Z`).getTime() - new Date(`${HISTORY_FLOOR}T12:00:00Z`).getTime()) / DAY_MS;
      const left = Math.max(0, (new Date(`${cursor}T12:00:00Z`).getTime() - new Date(`${HISTORY_FLOOR}T12:00:00Z`).getTime()) / DAY_MS);
      progress = Math.max(0, Math.min(100, Math.round(((total - left) / total) * 100)));
      detail = `Está em ${fmtDay(cursor)} · faltam ${Math.round(left)} dias até 01/01/2025`;
    }
    if (entry.kind === "reconcile" && cursor) detail = `Conferindo ${fmtDay(cursor)} no histórico${metadata.rounds ? ` · ${metadata.rounds} volta(s) completa(s)` : ""}; hoje e os 2 dias anteriores a cada ciclo`;
    return [{
      key: entry.key, label: entry.label, detail, lastSuccessAt: last, progress,
      lastAgo: ago(last, now), status: failing ? "error" : age > limit ? "stale" : "ok", error: row.last_error ? String(row.last_error).slice(0, 200) : null,
    } satisfies Collector];
  });

  const groups = new Map<string, LogGroup>();
  const logTotals = { error: 0, warning: 0 };
  for (const row of logResult.data ?? []) {
    const level = row.level === "error" ? "error" : "warning";
    logTotals[level] += 1;
    const message = String(row.message);
    const key = `${level}:${normalize(message)}`;
    const found = groups.get(key);
    if (found) { found.count += 1; continue; }
    const info = describe(message);
    groups.set(key, { key, level, count: 1, lastAt: String(row.created_at), lastAgo: ago(String(row.created_at), now), example: message.slice(0, 300), title: info.title, meaning: info.meaning, action: info.action, endpoint: row.endpoint ? String(row.endpoint).replace(/^https?:\/\//, "").slice(0, 70) : null });
  }
  const logs = [...groups.values()].sort((a, b) => (a.level === b.level ? b.count - a.count : a.level === "error" ? -1 : 1)).slice(0, 12);

  const estimates: Record<string, number> = {};
  for (const row of (estimateResult.data ?? []) as Array<{ table_name: string; estimate: number | string }>) estimates[row.table_name] = Number(row.estimate);
  const modalities = (modalityResult.data ?? []).map((row) => ({ day: String(row.day), modality: Number(row.modality), pncp: Number(row.pncp_total), ours: Number(row.our_total) }));
  const yesterday = new Date(now - DAY_MS).toISOString().slice(0, 10);
  const lastCheck = coverage.map((row) => row.checkedAt).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
  return { today, yesterday, lastCheckAgo: lastCheck ? ago(lastCheck, now) : null, collectors, coverage, modalities, logs, logTotals, estimates, runs: (runResult.data ?? []) as Array<Record<string, unknown>> };
}
