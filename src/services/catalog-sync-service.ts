import "server-only";
import { env } from "@/lib/env";
import { fetchJson } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";

/* Sincroniza o catálogo CATMAT/CATSER do Compras.gov.br para a busca por nome.
   Retomável: o checkpoint (última página concluída) fica em procurement_sync_state. */

type Kind = "material" | "servico";

const PAGE_SIZE = 500;
const STATE_KEY: Record<Kind, string> = { material: "CATALOG_CATMAT", servico: "CATALOG_CATSER" };

interface CatalogPage {
  resultado?: Array<Record<string, unknown>>;
  totalRegistros?: number;
  totalPaginas?: number;
}

export function normalizeSearchText(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function text(value: unknown) {
  if (value === null || value === undefined) return null;
  const result = String(value).trim();
  return result ? result : null;
}

function toRow(kind: Kind, item: Record<string, unknown>) {
  const code = text(kind === "material" ? item.codigoItem : item.codigoServico);
  const description = text(kind === "material" ? item.descricaoItem : item.nomeServico);
  if (!code || !description) return null;
  const pdmName = kind === "material" ? text(item.nomePdm) : text(item.nomeSubclasse);
  const className = text(item.nomeClasse);
  const updated = text(item.dataHoraAtualizacao);
  return {
    kind,
    code,
    description,
    pdm_code: kind === "material" ? text(item.codigoPdm) : text(item.codigoSubclasse),
    pdm_name: pdmName,
    class_code: text(item.codigoClasse),
    class_name: className,
    group_name: text(item.nomeGrupo),
    ncm_code: kind === "material" ? text(item.codigo_ncm) : text(item.codigoCpc),
    sustainable: kind === "material" ? item.itemSustentavel === true : null,
    active: kind === "material" ? item.statusItem !== false : item.statusServico !== false,
    search_text: normalizeSearchText([description, pdmName, className].filter(Boolean).join(" ")),
    source_updated_at: updated && !Number.isNaN(Date.parse(updated)) ? new Date(updated).toISOString() : null,
    imported_at: new Date().toISOString(),
  };
}

async function fetchPage(kind: Kind, page: number) {
  const path = kind === "material" ? "modulo-material/4_consultarItemMaterial" : "modulo-servico/6_consultarItemServico";
  const url = new URL(`${env.COMPRAS_GOV_API_BASE_URL}/${path}`);
  url.searchParams.set("pagina", String(page));
  url.searchParams.set("tamanhoPagina", String(PAGE_SIZE));
  return fetchJson<CatalogPage>(url, { provider: "COMPRAS_GOV", retries: 4, timeoutMs: 60_000, cacheSeconds: 0 });
}

export async function syncCatalog(kind: Kind, options: { restart?: boolean; maxPages?: number; log?: (message: string) => void } = {}) {
  const client = createAdminClient();
  const stateKey = STATE_KEY[kind];
  const log = options.log ?? (() => undefined);

  const { data: state } = await client.from("procurement_sync_state").select("last_page,metadata").eq("provider", stateKey).maybeSingle();
  const completed = (state?.metadata as { complete?: boolean } | null)?.complete === true;
  let page = options.restart || completed ? 1 : Number(state?.last_page ?? 0) + 1;
  let totalPages = Number((state?.metadata as { totalPages?: number } | null)?.totalPages ?? page);
  let saved = 0;
  let processedPages = 0;

  await client.from("procurement_sync_state").upsert(
    { provider: stateKey, last_sync_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() },
    { onConflict: "provider" },
  );

  try {
    while (page <= totalPages && processedPages < (options.maxPages ?? Number.POSITIVE_INFINITY)) {
      const response = await fetchPage(kind, page);
      totalPages = Math.max(1, Number(response.totalPaginas ?? 1));
      const rows = (response.resultado ?? []).map((item) => toRow(kind, item)).filter((row) => row !== null);
      if (rows.length) {
        const { error } = await client.from("catalog_items").upsert(rows, { onConflict: "kind,code" });
        if (error) throw error;
        saved += rows.length;
      }
      await client.from("procurement_sync_state").update({
        last_page: page,
        last_success_at: new Date().toISOString(),
        consecutive_failures: 0,
        metadata: { totalPages, totalRecords: response.totalRegistros ?? null, complete: page >= totalPages },
        updated_at: new Date().toISOString(),
      }).eq("provider", stateKey);
      log(`${kind}: página ${page}/${totalPages} (${saved} itens nesta execução)`);
      processedPages += 1;
      page += 1;
    }
    return { kind, saved, lastPage: page - 1, totalPages, complete: page > totalPages };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await client.from("procurement_sync_state").update({
      last_error: message.slice(0, 500), updated_at: new Date().toISOString(),
    }).eq("provider", stateKey);
    throw new Error(`Falha no catálogo ${kind} na página ${page}: ${message}`);
  }
}
