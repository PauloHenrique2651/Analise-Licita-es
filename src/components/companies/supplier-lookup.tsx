import Link from "next/link";
import { ExternalLink, SearchX } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { lookupSupplierResults } from "@/services/supplier-lookup-service";

const integer = new Intl.NumberFormat("pt-BR");
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const day = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");
const maskCnpj = (cnpj: string) => cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");

/** Em quais licitações um CNPJ aparece como fornecedor (consulta ao vivo nas fontes oficiais). */
export async function SupplierLookup({ cnpj }: { cnpj: string }) {
  let result: Awaited<ReturnType<typeof lookupSupplierResults>> = null;
  let failed = false;
  try { result = await lookupSupplierResults(cnpj); } catch { failed = true; }

  // Licitações que já temos na base abrem na nossa tela de detalhes
  const known = new Map<string, string>();
  if (result) {
    const supabase = await createClient();
    const controls = result.rows.slice(0, 200).map((row) => row.control);
    const { data } = supabase && controls.length ? await supabase.from("procurements").select("id,control_number").in("control_number", controls).limit(200) : { data: [] };
    for (const row of data ?? []) known.set(String(row.control_number), String(row.id));
  }

  return <section className="panel supplier-lookup" aria-label="Resultados do CNPJ nas fontes oficiais">
    <div className="panel-head"><div><p className="panel-title">Onde {maskCnpj(cnpj)} aparece</p><small>Consulta ao vivo no Compras.gov.br e PNCP, desde 01/01/2025</small></div></div>
    {failed && <div className="empty-inline tall"><SearchX aria-hidden="true" /><span>Não foi possível consultar as fontes oficiais agora. Tente de novo em instantes.</span></div>}
    {!failed && !result && <div className="empty-inline tall"><SearchX aria-hidden="true" /><span>Nenhum resultado registrado para este CNPJ desde 01/01/2025. O PNCP só publica o resultado de quem foi registrado como fornecedor do item; participações sem vitória não são divulgadas.</span></div>}
    {result && <>
      <div className="supplier-summary">
        <div><strong>{result.name ?? maskCnpj(cnpj)}</strong><small>{[result.size, result.legalNature].filter(Boolean).join(" · ") || "Fornecedor"}</small></div>
        <div><span>Licitações</span><strong>{integer.format(result.rows.length)}{result.truncated ? "+" : ""}</strong></div>
        <div><span>Itens com resultado</span><strong>{integer.format(result.resultItems)}</strong></div>
        <div><span>Valor homologado</span><strong>{money.format(result.totalValue)}</strong></div>
      </div>
      <div className="numbers-scroll supplier-table"><table className="compact-table">
        <thead><tr><th>Licitação</th><th>UF</th><th className="num">Itens</th><th className="num">Valor</th><th>Data</th><th>Situação</th><th>Portal</th></tr></thead>
        <tbody>{result.rows.slice(0, 100).map((row) => <tr key={row.control}>
          <td>{known.has(row.control) ? <Link href={`/app/licitacoes/${known.get(row.control)}`}>{row.control}</Link> : row.control}</td>
          <td>{row.uf ?? "—"}</td><td className="num">{integer.format(row.items)}</td><td className="num">{money.format(row.value)}</td><td>{day(row.date)}</td><td>{row.status ?? "—"}</td>
          <td>{row.pncpUrl ? <a href={row.pncpUrl} target="_blank" rel="noopener noreferrer">PNCP<ExternalLink aria-hidden="true" /></a> : "—"}</td>
        </tr>)}</tbody></table></div>
      <p className="muted supplier-note">Mostra as licitações em que o órgão registrou este CNPJ como fornecedor de algum item. Participações em que a empresa perdeu não são publicadas pelos portais.{result.truncated ? " Lista limitada às mais recentes." : ""}</p>
    </>}
  </section>;
}
