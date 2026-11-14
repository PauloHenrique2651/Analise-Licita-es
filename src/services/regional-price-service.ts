import "server-only";
import { comprasGovProvider } from "@/providers/compras-gov-provider";

/* Análise regional de preços a partir do Painel de Preços (Compras.gov.br).
   Cada registro é uma compra homologada de um item CATMAT/CATSER, com UF, município IBGE, fornecedor e preço unitário. */

export type CatalogKind = "material" | "servico";

export interface RegionalPriceFilters {
  kind: CatalogKind;
  code: string;
  uf?: string;
  municipio?: string;
  from?: string;
  to?: string;
  /** Sigla da unidade (ex.: "UN", "FD"), "todas" para misturar unidades, ou vazio para usar a mais frequente. */
  unit?: string;
}

export interface UnitOption { unit: string; name: string | null; purchases: number }

export interface PriceStats {
  purchases: number;
  quantity: number;
  totalValue: number;
  min: number;
  p25: number;
  median: number;
  p75: number;
  max: number;
  weightedAverage: number;
}

export interface GroupRow extends PriceStats { key: string; label: string; detail?: string }

export interface PurchaseRow {
  id: string;
  date: string | null;
  uf: string | null;
  municipio: string | null;
  buyer: string;
  supplier: string;
  supplierDocument: string | null;
  brand: string | null;
  unit: string | null;
  unitName: string | null;
  quantity: number;
  unitPrice: number;
  description: string;
}

export interface RegionalPriceAnalysis {
  filters: RegionalPriceFilters;
  itemDescription: string | null;
  totalAvailable: number;
  analyzed: number;
  truncated: boolean;
  stats: PriceStats | null;
  byState: GroupRow[];
  byCity: GroupRow[];
  suppliers: GroupRow[];
  brands: GroupRow[];
  units: UnitOption[];
  /** Unidade aplicada às estatísticas; null quando todas as unidades estão misturadas. */
  selectedUnit: string | null;
  /** true quando a unidade foi escolhida automaticamente (a mais frequente). */
  unitAuto: boolean;
  recent: PurchaseRow[];
  error: string | null;
}

const MAX_PAGES = 6; // até 3.000 compras por consulta, para manter a resposta rápida

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function number(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function quantile(sorted: number[], q: number) {
  if (!sorted.length) return 0;
  const position = (sorted.length - 1) * q;
  const base = Math.floor(position);
  const rest = position - base;
  return sorted[base + 1] !== undefined ? sorted[base] + rest * (sorted[base + 1] - sorted[base]) : sorted[base];
}

function computeStats(rows: PurchaseRow[]): PriceStats {
  const prices = rows.map((row) => row.unitPrice).sort((a, b) => a - b);
  const quantity = rows.reduce((sum, row) => sum + row.quantity, 0);
  const totalValue = rows.reduce((sum, row) => sum + row.unitPrice * row.quantity, 0);
  return {
    purchases: rows.length,
    quantity,
    totalValue,
    min: prices[0] ?? 0,
    p25: quantile(prices, 0.25),
    median: quantile(prices, 0.5),
    p75: quantile(prices, 0.75),
    max: prices[prices.length - 1] ?? 0,
    weightedAverage: quantity > 0 ? totalValue / quantity : prices.reduce((sum, price) => sum + price, 0) / (prices.length || 1),
  };
}

function groupBy(rows: PurchaseRow[], keyOf: (row: PurchaseRow) => { key: string; label: string; detail?: string } | null, limit: number) {
  const groups = new Map<string, { label: string; detail?: string; rows: PurchaseRow[] }>();
  for (const row of rows) {
    const group = keyOf(row);
    if (!group) continue;
    const current = groups.get(group.key) ?? { label: group.label, detail: group.detail, rows: [] };
    current.rows.push(row);
    groups.set(group.key, current);
  }
  return [...groups.entries()]
    .map(([key, group]) => ({ key, label: group.label, detail: group.detail, ...computeStats(group.rows) }))
    .sort((a, b) => b.totalValue - a.totalValue || b.purchases - a.purchases)
    .slice(0, limit);
}

function toPurchase(record: Record<string, unknown>): PurchaseRow | null {
  const unitPrice = number(record.precoUnitario);
  if (unitPrice === null || unitPrice <= 0) return null;
  const municipioCode = number(record.codigoMunicipio);
  return {
    id: text(record.idCompraItem) ?? `${record.idCompra ?? ""}-${record.numeroItemCompra ?? ""}`,
    date: text(record.dataResultado) ?? text(record.dataCompra),
    uf: text(record.estado),
    municipio: municipioCode ? `${municipioCode}|${text(record.municipio) ?? "Município não informado"}` : null,
    buyer: text(record.nomeUasg) ?? text(record.nomeOrgao) ?? "Órgão não informado",
    supplier: text(record.nomeFornecedor) ?? "Fornecedor não informado",
    supplierDocument: text(record.niFornecedor),
    brand: text(record.marca),
    unit: (text(record.siglaUnidadeFornecimento) ?? text(record.siglaUnidadeMedida) ?? text(record.nomeUnidadeMedida))?.toUpperCase() ?? null,
    unitName: text(record.nomeUnidadeFornecimento) ?? text(record.nomeUnidadeMedida),
    quantity: number(record.quantidade) ?? 0,
    unitPrice,
    description: text(record.descricaoItem) ?? "",
  };
}

function emptyAnalysis(filters: RegionalPriceFilters, error: string | null = null): RegionalPriceAnalysis {
  return { filters, itemDescription: null, totalAvailable: 0, analyzed: 0, truncated: false, stats: null, byState: [], byCity: [], suppliers: [], brands: [], units: [], selectedUnit: null, unitAuto: false, recent: [], error };
}

export async function getRegionalPriceAnalysis(filters: RegionalPriceFilters): Promise<RegionalPriceAnalysis> {
  const records: Record<string, unknown>[] = [];
  let totalAvailable = 0;
  let totalPages = 1;
  try {
    for (let page = 1; page <= Math.min(totalPages, MAX_PAGES); page += 1) {
      const response = await comprasGovProvider.searchPriceResearch({ ...filters, page });
      totalAvailable = response.totalRegistros;
      totalPages = Math.max(1, response.totalPaginas);
      records.push(...response.resultado);
      if (!response.resultado.length) break;
    }
  } catch {
    return emptyAnalysis(filters, "O Painel de Preços do Compras.gov.br não respondeu. Tente novamente em instantes.");
  }

  const allPurchases = records.map(toPurchase).filter((row): row is PurchaseRow => row !== null);
  if (!allPurchases.length) return { ...emptyAnalysis(filters), totalAvailable };

  // Preços só são comparáveis dentro da mesma unidade de fornecimento (unidade, fardo, caixa...).
  const unitMap = new Map<string, UnitOption>();
  for (const row of allPurchases) {
    const key = row.unit ?? "N/I";
    const current = unitMap.get(key) ?? { unit: key, name: row.unitName, purchases: 0 };
    current.purchases += 1;
    unitMap.set(key, current);
  }
  const units = [...unitMap.values()].sort((a, b) => b.purchases - a.purchases);
  const requested = filters.unit?.toUpperCase();
  let selectedUnit: string | null = null;
  let unitAuto = false;
  if (requested === "TODAS") selectedUnit = null;
  else if (requested && unitMap.has(requested)) selectedUnit = requested;
  else if (units.length > 1) { selectedUnit = units[0].unit; unitAuto = true; }
  const purchases = selectedUnit ? allPurchases.filter((row) => (row.unit ?? "N/I") === selectedUnit) : allPurchases;

  return {
    filters,
    itemDescription: allPurchases[0].description || null,
    totalAvailable,
    analyzed: purchases.length,
    truncated: totalAvailable > records.length,
    stats: computeStats(purchases),
    byState: groupBy(purchases, (row) => row.uf ? { key: row.uf, label: row.uf } : null, 27),
    byCity: groupBy(purchases, (row) => {
      if (!row.municipio) return null;
      const [code, name] = row.municipio.split("|");
      return { key: code, label: name, detail: row.uf ?? undefined };
    }, 30),
    suppliers: groupBy(purchases, (row) => ({ key: row.supplierDocument ?? row.supplier, label: row.supplier, detail: row.supplierDocument ?? undefined }), 15),
    brands: groupBy(purchases, (row) => row.brand ? { key: row.brand.toUpperCase(), label: row.brand } : null, 15),
    units,
    selectedUnit,
    unitAuto,
    recent: [...purchases].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")).slice(0, 25),
    error: null,
  };
}
