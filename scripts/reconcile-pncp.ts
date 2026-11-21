/**
 * Conferência contra o PNCP: para cada dia e modalidade compara o total OFICIAL do PNCP com o que temos e busca o que faltar.
 * Objetivo: 100% do PNCP. O espelho em tempo real e a carga histórica podem deixar escapar registros (página com erro, falha ao
 * gravar, publicação tardia); esta rotina fecha a diferença registro a registro.
 *
 * Uso: node ... scripts/reconcile-pncp.ts [--days=N] [--from=AAAA-MM-DD] [--floor=AAAA-MM-DD] [--once]
 *   --from  dia mais novo a conferir (padrão: hoje); depois a rotina anda para trás, guardando o ponto em procurement_sync_state.
 *   --days  quantos dias conferir por execução (padrão 2).
 *   --floor dia mais antigo (padrão 2025-01-01). Ao chegar nele, recomeça pelos dias mais recentes (publicações tardias).
 */
import { pncpConnector } from "../src/integrations/procurement/pncp/connector";
import type { NormalizedProcurement } from "../src/integrations/procurement/types";
import { pncpProvider } from "../src/providers/pncp-provider";
import { createAdminClient } from "../src/lib/supabase/admin";
import { ProcurementRepository } from "../src/repositories/procurement-repository";

const STATE_KEY = "RECONCILE_PNCP";
const FALLBACK_MODALITIES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
const argument = (name: string) => process.argv.find((value) => value.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const isoDay = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (day: string, amount: number) => isoDay(new Date(new Date(`${day}T12:00:00Z`).getTime() + amount * 86_400_000));
const brasiliaToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

type Gap = { day: string; modality: number; pncp: number; ours: number; missing: number; saved: number; failed: number };

async function main() {
  const client = createAdminClient();
  const repository = new ProcurementRepository(client);
  const source = await repository.getSource("PNCP");
  const floor = argument("floor") ?? process.env.NEXO_FLOOR ?? "2025-01-01";
  const days = Math.max(1, Math.min(Number(argument("days") ?? 2), 30));

  const { data: stored } = await client.from("procurement_sync_state").select("metadata").eq("provider", STATE_KEY).maybeSingle();
  const cursor = (stored?.metadata ?? {}) as { nextDay?: string; rounds?: number };
  let day = argument("from") ?? cursor.nextDay ?? brasiliaToday();
  let rounds = cursor.rounds ?? 0;

  let codes = FALLBACK_MODALITIES;
  try { const active = (await pncpProvider.listActiveModalities()).map((modality) => modality.id); if (active.length) codes = active; } catch { /* usa a lista verificada */ }

  const gaps: Gap[] = [];
  let checked = 0;
  for (let index = 0; index < days; index += 1) {
    if (day < floor) { day = brasiliaToday(); rounds += 1; } // terminou a volta: recomeça pelos dias recentes
    const start = new Date(`${day}T00:00:00-03:00`).toISOString();
    const end = new Date(`${addDays(day, 1)}T00:00:00-03:00`).toISOString();
    for (const modality of codes) {
      const first = await pncpConnector.fetchProcurements({ startDate: day, endDate: day, modalityCode: modality, page: 1, pageSize: 50 });
      const pncpTotal = first.totalRecords ?? 0;
      checked += 1;
      if (pncpTotal === 0) continue;
      const { count } = await client.from("procurements").select("id", { count: "exact", head: true })
        .eq("source_id", source.id).eq("modality_code", modality).gte("published_at", start).lt("published_at", end);
      const ours = count ?? 0;
      if (ours >= pncpTotal) continue;

      // Há diferença: lê todas as páginas do PNCP e separa o que não temos, registro a registro
      const records: NormalizedProcurement[] = [...first.records];
      for (let page = 2; page <= first.totalPages; page += 1) {
        const next = await pncpConnector.fetchProcurements({ startDate: day, endDate: day, modalityCode: modality, page, pageSize: 50 });
        records.push(...next.records);
      }
      const have = new Set<string>();
      for (let offset = 0; offset < records.length; offset += 100) {
        const ids = records.slice(offset, offset + 100).map((record) => record.externalId);
        const { data } = await client.from("procurements").select("external_id").eq("source_id", source.id).in("external_id", ids);
        for (const row of data ?? []) have.add(String(row.external_id));
      }
      const missing = records.filter((record) => !have.has(record.externalId));
      let saved = 0;
      let failed = 0;
      for (const record of missing) {
        try {
          try { record.items = await pncpConnector.fetchItems!(record); } catch { /* itens entram depois, pelo histórico de itens */ }
          await repository.save(record);
          saved += 1;
        } catch (error) {
          failed += 1;
          await client.from("sync_logs").insert({
            source_id: source.id, endpoint: record.sourceEndpoint, level: "error",
            message: (error instanceof Error ? error.message : "Falha ao gravar na conferência").slice(0, 500),
            metadata: { externalId: record.externalId, phase: "reconcile", day, modality },
          });
        }
      }
      gaps.push({ day, modality, pncp: pncpTotal, ours, missing: missing.length, saved, failed });
    }
    day = addDays(day, -1);
    if (argument("once")) break;
  }

  const now = new Date().toISOString();
  await client.from("procurement_sync_state").upsert({
    provider: STATE_KEY, last_sync_at: now, last_success_at: now, last_cursor: day, last_page: rounds, last_error: null,
    consecutive_failures: 0, metadata: { nextDay: day, rounds, lastGaps: gaps.slice(0, 20), checkedAt: now }, updated_at: now,
  }, { onConflict: "provider" });
  process.stdout.write(JSON.stringify({ checked, gaps, nextDay: day, rounds }));
}

main().catch((error: unknown) => {
  process.stderr.write(error instanceof Error ? error.message : "Falha desconhecida na conferência.");
  process.exitCode = 1;
});
