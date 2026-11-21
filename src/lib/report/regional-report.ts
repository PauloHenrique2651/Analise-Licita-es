/** Dados e textos do relatório gerencial por região (sem dependência de servidor: usado também nos testes). */

export type ReportParams = { regionName: string; cities: string[]; from: string; to: string; itemKind?: "material" | "servico" };

type Named = { name: string };
export type RegionalData = {
  totals: { procurements: number; value: number; avgValue: number; medianValue: number; agencies: number; cities: number; withoutValue: number; outliers: number; outlierValue: number; avgDeadlineDays: number; items: number };
  monthly: Array<{ month: string; count: number; value: number }>;
  byCity: Array<{ ibge: string; name: string; count: number; value: number; items: number }>;
  byModality: Array<Named & { count: number; value: number }>;
  byDispute: Array<Named & { count: number }>;
  byMeEpp: Array<Named & { count: number }>;
  byPortal: Array<Named & { count: number }>;
  byKind: Array<Named & { count: number; value: number }>;
  ranges: { upTo50k: number; upTo250k: number; upTo1m: number; above1m: number; noValue: number };
  topAgencies: Array<Named & { count: number; value: number }>;
  topProcurements: Array<{ id: string; control: string; object: string; agency: string | null; city: string; value: number; date: string }>;
  byNiche: Array<Named & { items: number; value: number; procurements: number }>;
  topProducts: Array<Named & { niche: string; items: number; procurements: number; value: number }>;
  topSuppliers: Array<Named & { wins: number; value: number }>;
};

const n = (value: unknown) => Number(value ?? 0) || 0;

/** O JSON do banco chega com números em texto em alguns campos: normaliza tudo para número e garante as listas. */
export function normalizeData(raw: Record<string, unknown>): RegionalData {
  const list = <T,>(key: string, map: (row: Record<string, unknown>) => T): T[] => (Array.isArray(raw[key]) ? (raw[key] as Array<Record<string, unknown>>).map(map) : []);
  const totals = (raw.totals ?? {}) as Record<string, unknown>;
  const ranges = (raw.ranges ?? {}) as Record<string, unknown>;
  const str = (value: unknown, fallback = "") => (value === null || value === undefined ? fallback : String(value));
  return {
    totals: { procurements: n(totals.procurements), value: n(totals.value), avgValue: n(totals.avgValue), medianValue: n(totals.medianValue), agencies: n(totals.agencies), cities: n(totals.cities), withoutValue: n(totals.withoutValue), outliers: n(totals.outliers), outlierValue: n(totals.outlierValue), avgDeadlineDays: n(totals.avgDeadlineDays), items: n(totals.items) },
    monthly: list("monthly", (row) => ({ month: str(row.month), count: n(row.count), value: n(row.value) })),
    byCity: list("byCity", (row) => ({ ibge: str(row.ibge), name: str(row.name), count: n(row.count), value: n(row.value), items: n(row.items) })),
    byModality: list("byModality", (row) => ({ name: str(row.name), count: n(row.count), value: n(row.value) })),
    byDispute: list("byDispute", (row) => ({ name: str(row.name), count: n(row.count) })),
    byMeEpp: list("byMeEpp", (row) => ({ name: str(row.name), count: n(row.count) })),
    byPortal: list("byPortal", (row) => ({ name: str(row.name), count: n(row.count) })),
    byKind: list("byKind", (row) => ({ name: str(row.name), count: n(row.count), value: n(row.value) })),
    ranges: { upTo50k: n(ranges.upTo50k), upTo250k: n(ranges.upTo250k), upTo1m: n(ranges.upTo1m), above1m: n(ranges.above1m), noValue: n(ranges.noValue) },
    topAgencies: list("topAgencies", (row) => ({ name: str(row.name), count: n(row.count), value: n(row.value) })),
    topProcurements: list("topProcurements", (row) => ({ id: str(row.id), control: str(row.control), object: str(row.object), agency: row.agency ? str(row.agency) : null, city: str(row.city), value: n(row.value), date: str(row.date) })),
    byNiche: list("byNiche", (row) => ({ name: str(row.name), items: n(row.items), value: n(row.value), procurements: n(row.procurements) })),
    topProducts: list("topProducts", (row) => ({ name: str(row.name), niche: str(row.niche), items: n(row.items), procurements: n(row.procurements), value: n(row.value) })),
    topSuppliers: list("topSuppliers", (row) => ({ name: str(row.name), wins: n(row.wins), value: n(row.value) })),
  };
}

export const intFmt = new Intl.NumberFormat("pt-BR");
const decimal = (value: number, digits = 1) => value.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const percent = (part: number, total: number, digits = 0) => (total > 0 ? `${decimal((part / total) * 100, digits)}%` : "0%");

/** R$ em forma curta: R$ 9,4 bi, R$ 1,6 mi, R$ 17,5 mil. */
export function brl(value: number) {
  const abs = Math.abs(value);
  if (abs >= 1e9) return `R$ ${decimal(value / 1e9, 2)} bi`;
  if (abs >= 1e6) return `R$ ${decimal(value / 1e6, 1)} mi`;
  if (abs >= 1e4) return `R$ ${decimal(value / 1e3, 1)} mil`;
  return `R$ ${intFmt.format(Math.round(value))}`;
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const monthLabel = (value: string) => { const [year, month] = value.split("-"); return `${MONTHS[Number(month) - 1] ?? month}/${String(year).slice(2)}`; };
export const dateBr = (iso: string) => { const [year, month, day] = iso.slice(0, 10).split("-"); return `${day}/${month}/${year}`; };

export const MEEPP_LABELS: Record<string, string> = { exclusiva: "Exclusiva para ME/EPP", parcial: "Cota reservada ME/EPP", sem: "Sem benefício", "não informado": "Não informado" };
const KIND_LABELS: Record<string, string> = { material: "Materiais", servico: "Serviços", misto: "Material e serviço", "não classificado": "Não classificado" };
export const kindLabel = (name: string) => KIND_LABELS[name] ?? name;

export type Insight = { tone: "blue" | "green" | "amber" | "coral" | "violet"; title: string; text: string };

/** Respostas escritas às perguntas do relatório, calculadas só com os números do período escolhido. */
export function buildInsights(data: RegionalData, params: ReportParams): { summary: Insight[]; considerations: Insight[] } {
  const t = data.totals;
  const summary: Insight[] = [];
  const considerations: Insight[] = [];
  if (t.procurements === 0) {
    return { summary: [{ tone: "amber", title: "Sem licitações no período", text: "Nenhuma licitação foi encontrada para os municípios e o período escolhidos. Amplie o período ou inclua mais municípios." }], considerations: [] };
  }
  const topModality = data.byModality[0];
  const dispensa = data.byModality.find((row) => /dispensa/i.test(row.name));
  const pregao = data.byModality.filter((row) => /preg/i.test(row.name)).reduce((sum, row) => sum + row.count, 0);
  const exclusive = data.byMeEpp.find((row) => row.name === "exclusiva")?.count ?? 0;
  const topCity = data.byCity[0];
  const top3Value = data.byCity.slice(0, 3).reduce((sum, row) => sum + row.value, 0);
  const peak = [...data.monthly].sort((a, b) => b.count - a.count)[0];
  const low = [...data.monthly].filter((row) => row.count > 0).sort((a, b) => a.count - b.count)[0];
  const topNiche = data.byNiche[0];
  const nicheTotal = data.byNiche.reduce((sum, row) => sum + row.items, 0);
  const priced = Math.max(1, t.procurements - t.withoutValue - t.outliers);
  const small = data.ranges.upTo50k / priced;

  summary.push({ tone: "blue", title: "Quanto", text: `${intFmt.format(t.procurements)} licitações em ${intFmt.format(t.cities)} municípios movimentaram ${brl(t.value)} (valor homologado quando existe, senão o estimado), em ${intFmt.format(t.items)} itens. A mediana por licitação é ${brl(t.medianValue)} e a média ${brl(t.avgValue)}.` });
  if (topCity) summary.push({ tone: "green", title: "Onde", text: `${topCity.name} concentra ${percent(topCity.value, t.value)} do valor e ${percent(topCity.count, t.procurements)} das licitações. Os três maiores municípios somam ${percent(top3Value, t.value)} do valor da região.` });
  if (topModality) summary.push({ tone: "violet", title: "De que forma", text: `${topModality.name} é a modalidade mais usada (${percent(topModality.count, t.procurements)} das licitações)${dispensa && topModality !== dispensa ? `; dispensas somam ${percent(dispensa.count, t.procurements)}` : ""}. Pregões respondem por ${percent(pregao, t.procurements)} e ${percent(exclusive, t.procurements)} das licitações são exclusivas para ME/EPP.` });
  if (peak) summary.push({ tone: "amber", title: "Quando", text: `O maior volume foi em ${monthLabel(peak.month)} (${intFmt.format(peak.count)} licitações)${low && low.month !== peak.month ? " e o menor em " + monthLabel(low.month) + " (" + intFmt.format(low.count) + ")" : ""}. O prazo médio entre a publicação e a proposta é de ${decimal(t.avgDeadlineDays, 0)} dias.` });
  if (topNiche) summary.push({ tone: "coral", title: "O quê", text: `${topNiche.name} lidera os itens comprados (${percent(topNiche.items, nicheTotal)} dos itens classificados)${data.topProducts[0] ? `; o produto que aparece em mais licitações é "${data.topProducts[0].name}"` : ""}.` });

  considerations.push({ tone: "green", title: "Porta de entrada para pequenas empresas", text: `${percent(data.ranges.upTo50k, priced)} das licitações têm valor de até R$ 50 mil e ${percent(exclusive, t.procurements)} são exclusivas para ME/EPP: o volume é grande em contratações de baixo valor, onde o custo de participar é menor.` });
  if (t.avgValue > t.medianValue * 5) considerations.push({ tone: "amber", title: "Poucas licitações grandes puxam o valor", text: `A média (${brl(t.avgValue)}) é muito maior que a mediana (${brl(t.medianValue)}): ${intFmt.format(data.ranges.above1m)} licitações acima de R$ 1 milhão concentram boa parte do dinheiro. Analise o valor total junto com a quantidade.` });
  if (small > 0.6) considerations.push({ tone: "blue", title: "Mercado pulverizado", text: `A maior parte das compras é de pequeno valor e espalhada entre ${intFmt.format(t.agencies)} órgãos compradores. Vale acompanhar os órgãos mais recorrentes (veja o ranking) e montar alertas por produto.` });
  if (peak && low && peak.count > low.count * 1.6) considerations.push({ tone: "violet", title: "Sazonalidade", text: `O volume varia bastante ao longo do período (pico em ${monthLabel(peak.month)}). Planeje estoque, equipe e documentação para os meses de maior publicação.` });
  if (t.avgDeadlineDays > 0) considerations.push({ tone: "coral", title: "Tempo para preparar a proposta", text: `Em média as propostas abrem ${decimal(t.avgDeadlineDays, 0)} dias depois da publicação. Quem monitora diariamente tem mais tempo para orçar e reunir a documentação.` });
  if (t.outliers > 0) considerations.push({ tone: "coral", title: "Valores atípicos ficaram de fora", text: `${intFmt.format(t.outliers)} ${t.outliers === 1 ? "licitação tem valor" : "licitações têm valores"} a partir de R$ 200 milhões (somariam ${brl(t.outlierValue)}), muito acima do padrão da região e quase sempre erro de digitação nos portais. Elas contam na quantidade, mas não entram nos valores deste relatório.` });
  if (params.itemKind) considerations.push({ tone: "blue", title: "Recorte por tipo", text: `Este relatório considera só licitações de ${params.itemKind === "material" ? "materiais" : "serviços"} (incluindo as mistas).` });
  return { summary, considerations };
}

/** Macrorregião de Ribeirão Preto: sugestão inicial de municípios; o usuário confirma e ajusta na janela de filtros. */
export const RIBEIRAO_PRETO_REGION = [
  "Ribeirão Preto", "Sertãozinho", "Jardinópolis", "Cravinhos", "Serrana", "Batatais", "Brodowski", "Pontal", "Dumont", "Altinópolis",
  "Cajuru", "Barrinha", "Guatapará", "Luís Antônio", "Pradópolis", "Serra Azul", "São Simão", "Santa Rita do Passa Quatro",
  "Santa Rosa de Viterbo", "Santa Cruz da Esperança", "Santo Antônio da Alegria", "Cássia dos Coqueiros", "Sales Oliveira", "Nuporanga", "Orlândia", "Morro Agudo",
] as const;
