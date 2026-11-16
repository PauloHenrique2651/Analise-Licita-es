import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Gavel, ShieldCheck } from "lucide-react";
import { DisputeCopilot } from "@/components/dispute/dispute-copilot";
import { PricePosition } from "@/components/products/price-position";
import { createClient } from "@/lib/supabase/server";
import { floorPrice } from "@/lib/dispute-copilot";
import { getDisputeContext, listPreparedDisputes } from "@/services/dispute-copilot-service";

export const metadata: Metadata = { title: "Disputa" };
export const dynamic = "force-dynamic";

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateTime = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const fmt = (value: string | null) => (value ? dateTime.format(new Date(value)) : "—");

export default async function DisputePage({ searchParams }: { searchParams: Promise<{ item?: string }> }) {
  const { item: itemId } = await searchParams;

  if (itemId) {
    const context = await getDisputeContext(itemId);
    if (!context) notFound();
    const { item, strategy, references } = context;
    const procurement = item.procurement;
    const supabase = await createClient();
    const { data: groupRow } = supabase ? await supabase.from("procurement_items").select("group_id").eq("id", item.id).maybeSingle() : { data: null };
    const groupId = (groupRow as { group_id: string | null } | null)?.group_id ?? null;
    return (
      <>
        <Link className="back-link" href="/app/disputa"><ArrowLeft aria-hidden="true" />Disputas preparadas</Link>
        <header className="page-header copilot-header">
          <div>
            <h1>Item {item.itemNumber} · {item.description}</h1>
            <p>{[procurement?.agency, procurement?.city && procurement?.state ? `${procurement.city}/${procurement.state}` : procurement?.state, procurement?.controlNumber].filter(Boolean).join(" · ")}</p>
          </div>
          <div className="copilot-header-actions">
            {groupId && <Link className="button" href={`/app/produtos/${groupId}`}>Mercado deste produto</Link>}
            {procurement && <Link className="button" href={`/app/licitacoes/${procurement.id}`}>Ver licitação</Link>}
            {procurement?.sourceUrl && <a className="button primary" href={procurement.sourceUrl} target="_blank" rel="noreferrer">Abrir no portal<ExternalLink aria-hidden="true" /></a>}
          </div>
        </header>
        <div className="copilot-facts">
          <span><small>Modo de disputa</small>{procurement?.disputeMode ?? "Não informado"}</span>
          <span><small>Abertura</small>{fmt(procurement?.openingAt ?? null)}</span>
          <span><small>Propostas até</small>{fmt(procurement?.proposalEndAt ?? null)}</span>
          <span><small>Quantidade</small>{item.quantity !== null ? `${item.quantity.toLocaleString("pt-BR")} ${item.unit ?? ""}` : "—"}</span>
          <span><small>Estimado unitário</small>{item.estimatedUnitValue !== null ? currency.format(item.estimatedUnitValue) : "—"}</span>
          <span><small>Catálogo</small>{item.catalogCode ?? "—"}</span>
        </div>
        <p className="copilot-disclaimer"><ShieldCheck aria-hidden="true" />O Nexo não envia lances. Você confere a recomendação e digita o valor no portal oficial, com o seu login.</p>
        {groupId && <section className="panel dispute-position"><div className="panel-head"><div><p className="panel-title">Onde o seu valor fica frente aos vencedores</p><small>Compare com o que este produto foi vencido nos últimos meses</small></div></div><PricePosition groupId={groupId} groupName={item.description} defaultOffered={item.estimatedUnitValue ?? undefined} /></section>}
        <DisputeCopilot itemId={item.id} strategy={strategy} estimatedUnitValue={item.estimatedUnitValue} references={references} disputeMode={procurement?.disputeMode ?? null} />
      </>
    );
  }

  const disputes = await listPreparedDisputes();
  return (
    <>
      <header className="page-header">
        <div>
          <h1>Disputa</h1>
          <p>Prepare custo, margem e intervalo de cada item antes da sessão. Na hora, o copiloto diz o próximo lance e quando parar.</p>
        </div>
      </header>
      <section className="panel dispute-position"><div className="panel-head"><div><p className="panel-title">Posicione o seu preço</p><small>Escolha um produto, informe o valor que pretende oferecer e veja em que posição ficaria entre os vencedores recentes e frente a outros clientes do Nexo</small></div></div><PricePosition /></section>
      {disputes.length === 0 ? (
        <section className="panel module-empty">
          <div className="module-empty-icon"><Gavel aria-hidden="true" /></div>
          <h2>Nenhuma disputa preparada</h2>
          <p>Abra uma licitação, vá até os itens e escolha “Preparar disputa” no item que você vai disputar.</p>
          <Link className="button primary" href="/app/hoje">Ver licitações de hoje</Link>
        </section>
      ) : (
        <section className="panel">
          <div className="panel-head"><div><p className="panel-title">Disputas preparadas</p><small>Ordenadas pela última alteração.</small></div></div>
          <ol className="today-list">
            {disputes.map(({ item, strategy }) => (
              <li key={item.id}>
                <Link href={`/app/disputa?item=${item.id}`}>
                  <div className="today-list-main">
                    <strong>Item {item.itemNumber} · {item.description}</strong>
                    <span>{[item.procurement?.agency, item.procurement?.state, item.procurement?.controlNumber].filter(Boolean).join(" · ")}</span>
                    <div className="today-badges">{item.procurement?.disputeMode && <span className="badge">{item.procurement.disputeMode}</span>}</div>
                  </div>
                  <div className="today-list-side"><strong>Piso {currency.format(floorPrice(strategy))}</strong><small>abertura {fmt(item.procurement?.openingAt ?? null)}</small></div>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}
