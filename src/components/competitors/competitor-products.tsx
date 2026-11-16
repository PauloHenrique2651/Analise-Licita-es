import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const date = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });

/** Produtos em que o concorrente vence, com o preço dele frente à mediana do mercado. Cada linha leva ao produto. */
export async function CompetitorProducts({ supplierId }: { supplierId: string }) {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data } = await supabase.rpc("supplier_product_groups", { p_supplier_id: supplierId, p_days: 730, p_limit: 15 });
  const rows = (data ?? []) as Array<{ group_id: string; name: string; niche: string; unit: string | null; wins: number; median_unit_value: number | null; last_win_at: string | null; market_median: number | null }>;
  if (rows.length === 0) return null;
  return <section className="panel competitor-products">
    <div className="panel-head"><div><p className="panel-title">Produtos em que vence</p><small>Últimos 24 meses · o preço dele frente à mediana do mercado</small></div></div>
    <ul className="competitor-product-list">
      {rows.map((row) => {
        const own = row.median_unit_value === null ? null : Number(row.median_unit_value);
        const market = row.market_median === null ? null : Number(row.market_median);
        const diff = own !== null && market ? Math.round(((own - market) / market) * 100) : null;
        return <li key={row.group_id}>
          <div><Link href={`/app/produtos/${row.group_id}`}><strong>{row.name}</strong></Link><span>{row.niche} · {Number(row.wins)} vitória{Number(row.wins) === 1 ? "" : "s"}{row.last_win_at ? ` · última em ${date.format(new Date(row.last_win_at))}` : ""}</span></div>
          <div className="competitor-product-price">
            <strong>{own !== null ? `${money.format(own)}${row.unit ? ` / ${row.unit}` : ""}` : "—"}</strong>
            {diff !== null && <small className={diff <= 0 ? "below" : "above"}>{diff === 0 ? "igual ao mercado" : `${Math.abs(diff)}% ${diff < 0 ? "abaixo" : "acima"} do mercado`}</small>}
          </div>
        </li>;
      })}
    </ul>
  </section>;
}
