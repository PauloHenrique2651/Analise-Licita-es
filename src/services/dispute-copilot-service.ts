import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { DecrementType } from "@/lib/dispute-copilot";
import { getRegionalPriceAnalysis } from "@/services/regional-price-service";

export interface DisputeItem {
  id: string;
  itemNumber: number;
  description: string;
  catalogCode: string | null;
  unit: string | null;
  quantity: number | null;
  estimatedUnitValue: number | null;
  kind: "material" | "servico" | null;
  procurement: {
    id: string;
    controlNumber: string | null;
    object: string | null;
    agency: string | null;
    city: string | null;
    state: string | null;
    modality: string | null;
    disputeMode: string | null;
    openingAt: string | null;
    proposalEndAt: string | null;
    sourceUrl: string | null;
  } | null;
}

export interface SavedStrategy {
  unitCost: number;
  minMarginPct: number;
  openingBid: number | null;
  minDecrement: number;
  decrementType: DecrementType;
  notes: string | null;
  updatedAt: string;
}

export interface MarketReference {
  scope: string;
  unit: string | null;
  median: number;
  p25: number;
  min: number;
  purchases: number;
}

export interface DisputeContext {
  item: DisputeItem;
  strategy: SavedStrategy | null;
  references: MarketReference[];
}

type Row = Record<string, unknown>;
const one = <T,>(value: T | T[] | null | undefined) => (Array.isArray(value) ? value[0] ?? null : value ?? null);
const num = (value: unknown) => (value === null || value === undefined || value === "" ? null : Number.isFinite(Number(value)) ? Number(value) : null);
const str = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

const ITEM_COLUMNS = "id,item_number,original_description,catalog_item_code,unit,quantity,estimated_unit_value,item_kind,procurements(id,control_number,object_description,agency_name,city_name,state_code,modality_name,dispute_mode,opening_at,proposal_end_at,source_url)";

function toItem(row: Row): DisputeItem {
  const procurement = one(row.procurements as Row | Row[] | null);
  return {
    id: String(row.id),
    itemNumber: Number(row.item_number),
    description: str(row.original_description) ?? "Item sem descrição",
    catalogCode: str(row.catalog_item_code),
    unit: str(row.unit),
    quantity: num(row.quantity),
    estimatedUnitValue: num(row.estimated_unit_value),
    kind: row.item_kind === "servico" ? "servico" : row.item_kind === "material" ? "material" : null,
    procurement: procurement ? {
      id: String(procurement.id),
      controlNumber: str(procurement.control_number),
      object: str(procurement.object_description),
      agency: str(procurement.agency_name),
      city: str(procurement.city_name),
      state: str(procurement.state_code),
      modality: str(procurement.modality_name),
      disputeMode: str(procurement.dispute_mode),
      openingAt: str(procurement.opening_at),
      proposalEndAt: str(procurement.proposal_end_at),
      sourceUrl: str(procurement.source_url),
    } : null,
  };
}

function toStrategy(row: Row | null): SavedStrategy | null {
  if (!row) return null;
  return {
    unitCost: Number(row.unit_cost),
    minMarginPct: Number(row.min_margin_pct),
    openingBid: num(row.opening_bid),
    minDecrement: Number(row.min_decrement),
    decrementType: row.decrement_type === "percentual" ? "percentual" : "valor",
    notes: str(row.notes),
    updatedAt: String(row.updated_at),
  };
}

/** Preço praticado para o mesmo código de catálogo, no Brasil e no estado da licitação. */
async function marketReferences(item: DisputeItem): Promise<MarketReference[]> {
  if (!item.catalogCode || !/^\d{1,9}$/.test(item.catalogCode)) return [];
  const kind = item.kind === "servico" ? "servico" : "material";
  const unit = item.unit?.toUpperCase();
  const scopes: Array<{ label: string; uf?: string }> = [{ label: "Brasil" }];
  if (item.procurement?.state) scopes.push({ label: item.procurement.state, uf: item.procurement.state });
  const results = await Promise.all(scopes.map(async (scope) => {
    const analysis = await getRegionalPriceAnalysis({ kind, code: item.catalogCode!, uf: scope.uf, unit });
    if (!analysis.stats) return null;
    return { scope: scope.label, unit: analysis.selectedUnit, median: analysis.stats.median, p25: analysis.stats.p25, min: analysis.stats.min, purchases: analysis.analyzed };
  }));
  return results.filter((reference): reference is MarketReference => reference !== null);
}

export async function getDisputeContext(itemId: string): Promise<DisputeContext | null> {
  if (!/^[0-9a-f-]{36}$/i.test(itemId)) return null;
  const supabase = await createClient();
  const [{ data: itemRow }, { data: strategyRow }] = await Promise.all([
    supabase.from("procurement_items").select(ITEM_COLUMNS).eq("id", itemId).maybeSingle(),
    supabase.from("bid_strategies").select("unit_cost,min_margin_pct,opening_bid,min_decrement,decrement_type,notes,updated_at").eq("procurement_item_id", itemId).maybeSingle(),
  ]);
  if (!itemRow) return null;
  const item = toItem(itemRow as Row);
  return { item, strategy: toStrategy(strategyRow as Row | null), references: await marketReferences(item) };
}

export interface PreparedDispute { item: DisputeItem; strategy: SavedStrategy }

export async function listPreparedDisputes(): Promise<PreparedDispute[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("bid_strategies")
    .select(`unit_cost,min_margin_pct,opening_bid,min_decrement,decrement_type,notes,updated_at,procurement_items(${ITEM_COLUMNS})`)
    .order("updated_at", { ascending: false })
    .limit(100);
  return (data ?? []).flatMap((row: Row) => {
    const itemRow = one(row.procurement_items as Row | Row[] | null);
    const strategy = toStrategy(row);
    return itemRow && strategy ? [{ item: toItem(itemRow), strategy }] : [];
  });
}
