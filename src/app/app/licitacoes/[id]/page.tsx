import Link from "next/link";
import { ArrowLeft, Building2, CalendarDays, ExternalLink, FileText, MapPin } from "lucide-react";
import { notFound } from "next/navigation";
import { ProcurementItems, type ProcurementItemView } from "@/components/procurement/procurement-items";
import { BidSimulator } from "@/components/procurement/bid-simulator";
import { ProcurementWorkspace } from "@/components/procurement/procurement-workspace";
import { createClient } from "@/lib/supabase/server";
import { getPncpProcurementDetails } from "@/services/pncp-procurement-detail-service";

export const dynamic = "force-dynamic";

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString("pt-BR") : "Não disponível na fonte";
}

function formatCurrency(value: number | string | null) {
  return value === null ? "Não disponível na fonte" : Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value));
}

function validExternalUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; }
}

export default async function ProcurementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  if (!supabase) notFound();
  const [{ data: procurement }, { data: itemRows }, { data: sourceRows }] = await Promise.all([
    supabase.from("procurements").select("*").eq("id", id).maybeSingle(),
    supabase.from("procurement_items").select("id,item_number,original_description,catalog_item_code,unit,quantity,estimated_unit_value,estimated_total_value,homologated_total_value,status_name,has_result").eq("procurement_id", id).order("item_number"),
    supabase.from("procurement_sources").select("external_id,source_url,is_primary,sources(code,name)").eq("procurement_id", id).order("is_primary", { ascending: false }),
  ]);
  if (!procurement) notFound();
  const officialData = await getPncpProcurementDetails({
    cnpj: procurement.agency_cnpj,
    year: procurement.purchase_year,
    sequence: procurement.sequence_number,
    pncpId: procurement.pncp_id,
  });

  const links = new Map<string, { label: string; url: string }>();
  for (const row of sourceRows ?? []) {
    const source = Array.isArray(row.sources) ? row.sources[0] : row.sources;
    if (validExternalUrl(row.source_url)) links.set(row.source_url, { label: `Abrir em ${source?.name ?? "portal oficial"}`, url: row.source_url });
  }
  for (const value of [procurement.source_url, procurement.edital_url]) {
    if (validExternalUrl(value)) links.set(value, { label: value === procurement.edital_url ? "Abrir edital/processo oficial" : "Abrir no portal oficial", url: value });
  }
  const items: ProcurementItemView[] = (itemRows ?? []).map((item) => ({
    id: item.id, itemNumber: item.item_number, description: item.original_description,
    code: item.catalog_item_code, unit: item.unit, quantity: item.quantity === null ? null : Number(item.quantity),
    unitValue: item.estimated_unit_value === null ? null : Number(item.estimated_unit_value),
    totalValue: item.estimated_total_value === null && item.homologated_total_value === null ? null : Number(item.estimated_total_value ?? item.homologated_total_value),
    status: item.status_name, hasResult: item.has_result,
  }));

  return <>
    <Link className="back-link" href="/app/licitacoes"><ArrowLeft aria-hidden="true" />Voltar para licitações</Link>
    <header className="page-header procurement-detail-header"><div><p className="eyebrow">DETALHE DA LICITAÇÃO</p><h1>{procurement.control_number}</h1><p>{procurement.object_description}</p></div><div className="official-links">{[...links.values()].map((link) => <a className="button primary" href={link.url} target="_blank" rel="noopener noreferrer" key={link.url}>{link.label}<ExternalLink aria-hidden="true" /></a>)}</div></header>
    <ProcurementWorkspace officialData={officialData} officialLinks={[...links.values()]} location={[procurement.city_name, procurement.state_code].filter(Boolean).join(" / ")} information={<><section className="procurement-summary-grid">
      <article className="panel summary-card"><Building2 aria-hidden="true" /><span>Órgão</span><strong>{procurement.agency_name ?? "Não disponível na fonte"}</strong><small>{procurement.agency_cnpj ?? procurement.unit_name ?? "Unidade não informada"}</small></article>
      <article className="panel summary-card"><MapPin aria-hidden="true" /><span>Localização</span><strong>{[procurement.city_name, procurement.state_code].filter(Boolean).join(" / ") || "Não disponível na fonte"}</strong><small>{procurement.modality_name ?? "Modalidade não informada"}</small></article>
      <article className="panel summary-card"><CalendarDays aria-hidden="true" /><span>Prazo de propostas</span><strong>{formatDate(procurement.proposal_end_at)}</strong><small>Publicada em {formatDate(procurement.published_at)}</small></article>
      <article className="panel summary-card"><FileText aria-hidden="true" /><span>Situação e valor</span><strong>{procurement.status_name ?? "Não disponível na fonte"}</strong><small>{formatCurrency(procurement.estimated_value)}</small></article>
    </section><section className="panel procurement-metadata"><div className="panel-head"><div><p className="panel-title">Dados do processo</p><small>Informações normalizadas com rastreabilidade à fonte</small></div></div><dl><div><dt>Processo</dt><dd>{procurement.process_number ?? "Não disponível"}</dd></div><div><dt>Número da compra</dt><dd>{procurement.purchase_number ?? "Não disponível"}</dd></div><div><dt>Modalidade</dt><dd>{procurement.modality_name ?? "Não disponível"}</dd></div><div><dt>Abertura</dt><dd>{formatDate(procurement.opening_at)}</dd></div><div><dt>Valor estimado</dt><dd>{formatCurrency(procurement.estimated_value)}</dd></div><div><dt>Valor homologado</dt><dd>{formatCurrency(procurement.homologated_value)}</dd></div></dl></section><BidSimulator items={items} /></>} items={<ProcurementItems items={items} />} />
  </>;
}
