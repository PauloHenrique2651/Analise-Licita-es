"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function MarketChart({ data }: { data: Array<{ period: string; value: number }> }) {
  if (!data.length) return <div className="chart-empty"><span>Sem dados para o período</span><small>Sincronize uma fonte ou altere os filtros.</small></div>;
  return (
    <div className="chart-container" role="img" aria-label="Evolução mensal do valor homologado no período selecionado">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 12, right: 8, left: -8, bottom: 0 }}>
          <defs><linearGradient id="market-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2340c8" stopOpacity={0.28}/><stop offset="100%" stopColor="#2340c8" stopOpacity={0}/></linearGradient></defs>
          <CartesianGrid stroke="#e2e6eb" vertical={false} />
          <XAxis dataKey="period" tickFormatter={(value) => { const [year, month] = String(value).split("-"); return `${["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"][Number(month) - 1] ?? month}/${year.slice(2)}`; }} stroke="#6f7b88" tickLine={false} axisLine={false} fontSize={11} />
          <YAxis stroke="#6f7b88" tickLine={false} axisLine={false} fontSize={11} tickFormatter={(value) => Intl.NumberFormat("pt-BR", { notation: "compact" }).format(value)} />
          <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid #e2e6eb", borderRadius: 8 }} formatter={(value) => [Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value)), "Valor"]} />
          <Area type="monotone" dataKey="value" stroke="#2340c8" strokeWidth={2} fill="url(#market-fill)" activeDot={{ r: 6, fill: "#2340c8", stroke: "#ffffff", strokeWidth: 3 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
