"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function MarketChart({ data }: { data: Array<{ period: string; value: number }> }) {
  if (!data.length) return <div className="chart-empty"><span>Sem dados para o período</span><small>Sincronize uma fonte ou altere os filtros.</small></div>;
  return (
    <div className="chart-container" role="img" aria-label="Evolução mensal do valor homologado no período selecionado">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 12, right: 8, left: -8, bottom: 0 }}>
          <defs><linearGradient id="market-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#20e38a" stopOpacity={0.28}/><stop offset="100%" stopColor="#20e38a" stopOpacity={0}/></linearGradient></defs>
          <CartesianGrid stroke="#252d28" vertical={false} />
          <XAxis dataKey="period" stroke="#7f8a82" tickLine={false} axisLine={false} fontSize={11} />
          <YAxis stroke="#7f8a82" tickLine={false} axisLine={false} fontSize={11} tickFormatter={(value) => Intl.NumberFormat("pt-BR", { notation: "compact" }).format(value)} />
          <Tooltip contentStyle={{ background: "#0f1411", border: "1px solid #3a463f", borderRadius: 0 }} formatter={(value) => [Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value)), "Valor"]} />
          <Area type="monotone" dataKey="value" stroke="#20e38a" strokeWidth={2} fill="url(#market-fill)" activeDot={{ r: 6, fill: "#20e38a", stroke: "#050706", strokeWidth: 3 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
