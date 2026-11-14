import "server-only";
import { calculateCompetition, type CompetitionAnalysis, type CompetitionReference } from "@/services/bid-competition";
import { createClient } from "@/lib/supabase/server";

export class BidSimulationError extends Error {
  constructor(readonly code: "UNAUTHORIZED" | "NOT_FOUND" | "TENANT_REQUIRED" | "PERSISTENCE_FAILED") {
    super(code);
  }
}

type SimulationInput = {
  procurementItemId: string;
  productDescription: string;
  offeredUnitValue: number;
};

type ProcurementSummary = { control_number?: string | null; published_at?: string | null };

function one<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function sameUnit(left: string | null | undefined, right: string | null | undefined) {
  if (!left || !right) return true;
  return left.trim().toLocaleUpperCase("pt-BR") === right.trim().toLocaleUpperCase("pt-BR");
}

function asReference(row: Record<string, unknown>): CompetitionReference | null {
  const unitValue = Number(row.unit_value);
  if (!Number.isFinite(unitValue) || unitValue <= 0) return null;
  const supplier = one(row.suppliers as { legal_name?: string | null } | Array<{ legal_name?: string | null }> | null);
  const item = one(row.procurement_items as Record<string, unknown> | Array<Record<string, unknown>> | null);
  const procurement = item ? one(item.procurements as ProcurementSummary | ProcurementSummary[] | null) : null;
  return {
    id: String(row.id), unitValue, procurementNumber: procurement?.control_number ?? null,
    supplierName: supplier?.legal_name ?? null, observedAt: procurement?.published_at ?? (typeof row.imported_at === "string" ? row.imported_at : null),
    sourceUrl: typeof row.source_endpoint === "string" ? row.source_endpoint : null,
  };
}

export async function simulateBid(input: SimulationInput): Promise<CompetitionAnalysis> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new BidSimulationError("UNAUTHORIZED");

  const [{ data: profile }, { data: target, error: targetError }] = await Promise.all([
    supabase.from("users").select("active_tenant_id").eq("id", user.id).maybeSingle(),
    supabase.from("procurement_items").select("id,catalog_item_code,normalized_description,original_description,unit,quantity,bids_complete").eq("id", input.procurementItemId).maybeSingle(),
  ]);
  if (targetError || !target) throw new BidSimulationError("NOT_FOUND");
  if (!profile?.active_tenant_id) throw new BidSimulationError("TENANT_REQUIRED");

  let analysis: CompetitionAnalysis;
  if (target.bids_complete) {
    const { data: bidRows, error } = await supabase.from("bids")
      .select("id,unit_value,imported_at,source_endpoint,suppliers(legal_name)")
      .eq("procurement_item_id", target.id)
      .not("unit_value", "is", null)
      .limit(500);
    if (error) throw error;
    const references = (bidRows ?? []).map((row) => asReference(row as Record<string, unknown>)).filter((row): row is CompetitionReference => row !== null);
    analysis = calculateCompetition({ offeredUnitValue: input.offeredUnitValue, method: "exact_bids", references });
  } else {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 36);
    const matchByCatalog = Boolean(target.catalog_item_code);
    let query = supabase.from("results")
      .select("id,unit_value,imported_at,source_endpoint,suppliers(legal_name),procurement_items!inner(id,catalog_item_code,normalized_description,original_description,unit,procurements!inner(control_number,published_at))")
      .eq("winner", true)
      .neq("procurement_item_id", target.id)
      .not("unit_value", "is", null)
      .gte("imported_at", cutoff.toISOString())
      .limit(500);
    if (matchByCatalog) query = query.eq("procurement_items.catalog_item_code", target.catalog_item_code);
    else if (target.normalized_description) query = query.eq("procurement_items.normalized_description", target.normalized_description);
    else query = query.eq("procurement_items.original_description", target.original_description);
    const { data: historicalRows, error } = await query;
    if (error) throw error;
    const references = (historicalRows ?? [])
      .filter((row) => sameUnit(target.unit, one((row as Record<string, unknown>).procurement_items as Record<string, unknown> | Array<Record<string, unknown>> | null)?.unit as string | null | undefined))
      .map((row) => asReference(row as Record<string, unknown>))
      .filter((row): row is CompetitionReference => row !== null);
    analysis = calculateCompetition({
      offeredUnitValue: input.offeredUnitValue,
      method: matchByCatalog ? "historical_catalog" : "historical_description",
      references,
    });
  }

  const { error: insertError } = await supabase.from("bid_simulations").insert({
    tenant_id: profile.active_tenant_id,
    user_id: user.id,
    procurement_item_id: target.id,
    product_description: input.productDescription,
    product_code: target.catalog_item_code,
    offered_unit_value: input.offeredUnitValue,
    offered_quantity: target.quantity,
    analysis_method: analysis.method,
    outcome: analysis.outcome,
    projected_rank: analysis.projectedRank,
    confidence: analysis.confidence,
    reference_count: analysis.referenceCount,
    result_payload: analysis,
  });
  if (insertError) throw new BidSimulationError("PERSISTENCE_FAILED");
  return analysis;
}
