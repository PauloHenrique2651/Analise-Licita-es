import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export interface ProcurementSummaryItem {
  id: string;
  item_number: number;
  original_description: string;
  catalog_item_code: string | null;
  unit: string | null;
  quantity: number | null;
  estimated_unit_value: number | null;
  estimated_total_value: number | null;
  benefit_type: string | null;
  status_name: string | null;
}

export interface ProcurementSummary {
  id: string;
  control_number: string | null;
  object_description: string | null;
  agency_name: string | null;
  agency_cnpj: string | null;
  unit_name: string | null;
  city_name: string | null;
  state_code: string | null;
  modality_name: string | null;
  status_name: string | null;
  dispute_mode: string | null;
  me_epp_benefit: string | null;
  item_kind: string | null;
  estimated_value: number | null;
  published_at: string | null;
  proposal_end_at: string | null;
  opening_at: string | null;
  source_portal_name: string | null;
  source_url: string | null;
  edital_url: string | null;
  items: ProcurementSummaryItem[];
  opportunityId: string | null;
}

const PROCUREMENT_COLUMNS = "id,control_number,object_description,agency_name,agency_cnpj,unit_name,city_name,state_code,modality_name,status_name,dispute_mode,me_epp_benefit,item_kind,estimated_value,published_at,proposal_end_at,opening_at,source_portal_name,source_url,edital_url";
const ITEM_COLUMNS = "id,item_number,original_description,catalog_item_code,unit,quantity,estimated_unit_value,estimated_total_value,benefit_type,status_name";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ message: "Licitação inválida." }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Sessão necessária." }, { status: 401 });

  const [{ data: procurement }, { data: items }, { data: opportunity }] = await Promise.all([
    supabase.from("procurements").select(PROCUREMENT_COLUMNS).eq("id", id).maybeSingle(),
    supabase.from("procurement_items").select(ITEM_COLUMNS).eq("procurement_id", id).order("item_number").limit(500),
    supabase.from("opportunities").select("id").eq("procurement_id", id).limit(1).maybeSingle(),
  ]);
  if (!procurement) return NextResponse.json({ message: "Licitação não encontrada." }, { status: 404 });

  const body: ProcurementSummary = {
    ...(procurement as Omit<ProcurementSummary, "items" | "opportunityId">),
    items: (items ?? []) as ProcurementSummaryItem[],
    opportunityId: (opportunity as { id: string } | null)?.id ?? null,
  };
  return NextResponse.json(body, { headers: { "Cache-Control": "private, no-store" } });
}
