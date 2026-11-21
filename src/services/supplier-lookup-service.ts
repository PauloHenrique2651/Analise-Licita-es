import "server-only";
import { env } from "@/lib/env";
import { fetchJson } from "@/lib/http";

export type SupplierLookupRow = {
  control: string; pncpUrl: string | null; orgCnpj: string | null; uf: string | null; items: number; value: number; date: string | null; status: string | null;
};
export type SupplierLookup = {
  cnpj: string; name: string | null; size: string | null; legalNature: string | null; resultItems: number; totalValue: number; rows: SupplierLookupRow[]; truncated: boolean;
};

const PAGE_SIZE = 100;
const MAX_PAGES = 5;

/** Documento só com dígitos se for um CNPJ (14) ou CPF (11) válido no formato; senão null. */
export function documentFrom(input: string) {
  const digits = input.replace(/[.\-/\s]/g, "");
  return /^\d{14}$/.test(digits) ? digits : null;
}

/** "46377800000127-1-001957/2026" -> link da compra no portal do PNCP. */
function pncpLink(control: string) {
  const match = control.match(/^(\d{14})-\d+-0*(\d+)\/(\d{4})$/);
  return match ? `https://pncp.gov.br/app/editais/${match[1]}/${match[3]}/${match[2]}` : null;
}

/**
 * Consulta ao vivo (Compras.gov / PNCP): resultados de itens em que o CNPJ aparece como fornecedor, desde 01/01/2025.
 * Serve para fornecedores que ainda não estão na nossa base. Só aparece o que o órgão registrou como resultado.
 */
export async function lookupSupplierResults(cnpj: string): Promise<SupplierLookup | null> {
  const today = new Date().toISOString().slice(0, 10);
  const byControl = new Map<string, SupplierLookupRow>();
  let name: string | null = null; let size: string | null = null; let nature: string | null = null;
  let resultItems = 0; let totalValue = 0; let truncated = false;
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url = new URL(`${env.COMPRAS_GOV_API_BASE_URL}/modulo-contratacoes/3_consultarResultadoItensContratacoes_PNCP_14133`);
    url.searchParams.set("niFornecedor", cnpj);
    url.searchParams.set("dataResultadoPncpInicial", "2025-01-01");
    url.searchParams.set("dataResultadoPncpFinal", today);
    url.searchParams.set("pagina", String(page));
    url.searchParams.set("tamanhoPagina", String(PAGE_SIZE));
    const raw = await fetchJson<{ resultado?: Array<Record<string, unknown>>; totalPaginas?: number } | null>(url, { provider: "COMPRAS_GOV", timeoutMs: 20_000, retries: 1, cacheSeconds: 0, sharedCacheSeconds: 600 });
    const list = raw?.resultado ?? [];
    for (const item of list) {
      name ??= item.nomeRazaoSocialFornecedor ? String(item.nomeRazaoSocialFornecedor) : null;
      size ??= item.porteFornecedorNome ? String(item.porteFornecedorNome) : null;
      nature ??= item.naturezaJuridicaNome ? String(item.naturezaJuridicaNome) : null;
      const control = String(item.numeroControlePNCPCompra ?? item.idCompra ?? "");
      if (!control) continue;
      const value = Number(item.valorTotalHomologado ?? 0) || 0;
      resultItems += 1; totalValue += value;
      const current = byControl.get(control) ?? { control, pncpUrl: pncpLink(control), orgCnpj: item.orgaoEntidadeCnpj ? String(item.orgaoEntidadeCnpj) : null, uf: item.unidadeOrgaoUfSigla ? String(item.unidadeOrgaoUfSigla) : null, items: 0, value: 0, date: item.dataResultadoPncp ? String(item.dataResultadoPncp).slice(0, 10) : null, status: item.situacaoCompraItemResultadoNome ? String(item.situacaoCompraItemResultadoNome) : null };
      current.items += 1; current.value += value;
      byControl.set(control, current);
    }
    if (page >= (raw?.totalPaginas ?? 1)) break;
    if (page === MAX_PAGES) truncated = true;
  }
  if (resultItems === 0) return null;
  const rows = [...byControl.values()].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  return { cnpj, name, size, legalNature: nature, resultItems, totalValue, rows, truncated };
}
