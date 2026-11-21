import PDFDocument from "pdfkit";
import {
  MEEPP_LABELS, brl, buildInsights, dateBr, intFmt, monthLabel, percent,
  type Insight, type RegionalData, type ReportParams,
} from "./regional-report";

type Doc = InstanceType<typeof PDFDocument>;

const W = 595.28;
const H = 841.89;
const M = 36;
const CW = W - M * 2;

const C = {
  navy: "#0f2347", blue: "#2f5bea", teal: "#14a38b", amber: "#f5a524", coral: "#ef6a5b", violet: "#7a5af8", cyan: "#22b8cf",
  ink: "#1b2740", muted: "#64748b", line: "#e3e9f3", soft: "#f3f6fc", white: "#ffffff",
};
const PALETTE = [C.blue, C.teal, C.amber, C.coral, C.violet, C.cyan, "#94a3b8"];
const TONES: Record<Insight["tone"], string> = { blue: C.blue, green: C.teal, amber: C.amber, coral: C.coral, violet: C.violet };

/** Corta o texto com reticências para caber na largura; mede com o mesmo tamanho de fonte em que será desenhado. */
const fit = (doc: Doc, text: string, width: number, size = 9, bold = false) => {
  doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(size);
  if (doc.widthOfString(text) <= width) return text;
  let cut = text;
  while (cut.length > 1 && doc.widthOfString(`${cut}…`) > width) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
};

function text(doc: Doc, value: string, x: number, y: number, opts: { size?: number; bold?: boolean; color?: string; width?: number; align?: "left" | "right" | "center"; lineGap?: number; wrap?: boolean } = {}) {
  if (y > H - 14) return; // texto abaixo da página abriria uma página nova em branco
  doc.font(opts.bold ? "Helvetica-Bold" : "Helvetica").fontSize(opts.size ?? 10).fillColor(opts.color ?? C.ink);
  doc.text(value, x, y, { width: opts.width, align: opts.align ?? "left", lineGap: opts.lineGap ?? 1.5, lineBreak: opts.wrap !== false && opts.width !== undefined });
}

function heightOf(doc: Doc, value: string, width: number, size: number) {
  doc.font("Helvetica").fontSize(size);
  return doc.heightOfString(value, { width, lineGap: 1.5 });
}

function card(doc: Doc, x: number, y: number, w: number, h: number, fill = C.soft) {
  doc.roundedRect(x, y, w, h, 8).fillAndStroke(fill, C.line);
}

function kpi(doc: Doc, x: number, y: number, w: number, label: string, value: string, note: string, color: string) {
  card(doc, x, y, w, 70, C.white);
  doc.roundedRect(x, y, 5, 70, 2).fill(color);
  text(doc, label, x + 16, y + 10, { size: 8.5, color: C.muted, width: w - 24 });
  text(doc, value, x + 16, y + 25, { size: 20, bold: true, color: C.navy, width: w - 24 });
  text(doc, fit(doc, note, w - 24, 7.5), x + 16, y + 52, { size: 7.5, color: C.muted, width: w - 24 });
}

function sectionHeader(doc: Doc, question: string, title: string, color: string) {
  doc.rect(0, 0, W, 86).fill(C.navy);
  doc.rect(0, 86, W, 4).fill(color);
  doc.save().fillOpacity(0.12).circle(W - 40, 20, 70).fill(color).restore();
  text(doc, question, M, 24, { size: 28, bold: true, color: C.white, width: CW });
  text(doc, title, M, 58, { size: 11, color: "#c7d3ee", width: CW - 20 });
}

function subtitle(doc: Doc, value: string, x: number, y: number, w: number, hint?: string) {
  text(doc, value, x, y, { size: 12, bold: true, color: C.navy, width: w });
  if (hint) text(doc, hint, x, y + 16, { size: 8.5, color: C.muted, width: w });
  return y + (hint ? 34 : 22);
}

function hbar(doc: Doc, x: number, y: number, w: number, rows: Array<{ label: string; value: number; display: string; sub?: string }>, color: string, labelW = 150) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  const valueW = 74;
  const barW = w - labelW - valueW - 8;
  let cy = y;
  rows.forEach((row, index) => {
    doc.font("Helvetica").fontSize(9);
    text(doc, fit(doc, row.label, labelW - 6, 9), x, cy + 2, { size: 9, color: C.ink, width: labelW, wrap: false });
    doc.roundedRect(x + labelW, cy, barW, 14, 4).fill(C.soft);
    doc.roundedRect(x + labelW, cy, Math.max(3, (row.value / max) * barW), 14, 4).fill(index === 0 ? color : `${color}`);
    if (index > 0) doc.save().fillOpacity(0.35).roundedRect(x + labelW, cy, Math.max(3, (row.value / max) * barW), 14, 4).fill(C.white).restore();
    text(doc, row.display, x + w - valueW, cy + 2, { size: 9, bold: true, color: C.navy, width: valueW, align: "right" });
    if (row.sub) text(doc, fit(doc, row.sub, labelW + barW, 7.5), x + labelW, cy + 15, { size: 7.5, color: C.muted, width: barW });
    cy += row.sub ? 28 : 22;
  });
  return cy;
}

function wedge(doc: Doc, cx: number, cy: number, r: number, a0: number, a1: number, color: string) {
  const steps = Math.max(2, Math.ceil((a1 - a0) / (Math.PI / 60)));
  doc.moveTo(cx, cy);
  for (let step = 0; step <= steps; step += 1) {
    const angle = a0 + ((a1 - a0) * step) / steps;
    doc.lineTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
  }
  doc.closePath().fill(color);
}

function donut(doc: Doc, x: number, y: number, w: number, items: Array<{ label: string; value: number }>, total?: number, centerFormat: (value: number) => string = (value) => intFmt.format(value)) {
  const sum = total ?? items.reduce((acc, item) => acc + item.value, 0);
  const r = 52;
  const cx = x + r + 4;
  const cy = y + r + 4;
  if (sum <= 0) { text(doc, "Sem dados", x, y + 40, { size: 9, color: C.muted, width: w }); return y + 120; }
  let angle = -Math.PI / 2;
  items.forEach((item, index) => {
    const span = (item.value / sum) * Math.PI * 2;
    if (span > 0) wedge(doc, cx, cy, r, angle, angle + span - 0.004, PALETTE[index % PALETTE.length]);
    angle += span;
  });
  doc.circle(cx, cy, r * 0.58).fill(C.white);
  text(doc, centerFormat(sum), cx - 32, cy - 9, { size: sum > 1e5 && centerFormat(sum).startsWith("R$") ? 10.5 : 13, bold: true, color: C.navy, width: 64, align: "center", wrap: false });
  text(doc, "total", cx - 30, cy + 6, { size: 7.5, color: C.muted, width: 60, align: "center" });
  const lx = x + r * 2 + 20;
  let ly = y + 6;
  items.slice(0, 7).forEach((item, index) => {
    doc.roundedRect(lx, ly + 2, 9, 9, 2).fill(PALETTE[index % PALETTE.length]);
    text(doc, fit(doc, item.label, w - r * 2 - 70, 8.5), lx + 14, ly, { size: 8.5, color: C.ink, width: w - r * 2 - 70 });
    text(doc, percent(item.value, sum), x + w - 38, ly, { size: 8.5, bold: true, color: C.navy, width: 38, align: "right" });
    ly += 16;
  });
  return y + r * 2 + 14;
}

function columns(doc: Doc, x: number, y: number, w: number, h: number, data: Array<{ label: string; count: number; value: number }>) {
  card(doc, x, y, w, h, C.white);
  const px = x + 40;
  const py = y + 22;
  const pw = w - 90;
  const ph = h - 62;
  const maxCount = Math.max(1, ...data.map((row) => row.count));
  const maxValue = Math.max(1, ...data.map((row) => row.value));
  for (let tick = 0; tick <= 4; tick += 1) {
    const gy = py + ph - (ph * tick) / 4;
    doc.moveTo(px, gy).lineTo(px + pw, gy).lineWidth(0.5).stroke(C.line);
    text(doc, intFmt.format(Math.round((maxCount * tick) / 4)), x + 4, gy - 4, { size: 7.5, color: C.muted, width: 32, align: "right" });
    text(doc, brl((maxValue * tick) / 4).replace("R$ ", ""), px + pw + 4, gy - 4, { size: 7.5, color: C.coral, width: 44 });
  }
  const slot = pw / Math.max(1, data.length);
  const bw = Math.min(28, slot * 0.62);
  const peak = data.reduce((best, row, index) => (row.count > data[best].count ? index : best), 0);
  data.forEach((row, index) => {
    const bh = (row.count / maxCount) * ph;
    const bx = px + slot * index + (slot - bw) / 2;
    doc.roundedRect(bx, py + ph - bh, bw, Math.max(1, bh), 3).fill(index === peak ? C.amber : C.blue);
    text(doc, monthLabelShort(row.label), bx - 8, py + ph + 6, { size: 7.5, color: C.muted, width: bw + 16, align: "center" });
  });
  const pts = data.map((row, index) => [px + slot * index + slot / 2, py + ph - (row.value / maxValue) * ph] as const);
  if (pts.length > 1) {
    doc.moveTo(pts[0][0], pts[0][1]);
    pts.slice(1).forEach(([px2, py2]) => doc.lineTo(px2, py2));
    doc.lineWidth(2).stroke(C.coral);
  }
  pts.forEach(([px2, py2]) => doc.circle(px2, py2, 2.6).fill(C.coral));
  doc.roundedRect(x + 14, y + h - 22, 9, 9, 2).fill(C.blue);
  text(doc, "Licitações publicadas", x + 28, y + h - 22, { size: 8, color: C.muted, width: 100 });
  doc.roundedRect(x + 140, y + h - 22, 9, 9, 2).fill(C.amber);
  text(doc, "Mês de pico", x + 154, y + h - 22, { size: 8, color: C.muted, width: 60 });
  doc.moveTo(x + 224, y + h - 17).lineTo(x + 240, y + h - 17).lineWidth(2).stroke(C.coral);
  text(doc, "Valor movimentado (eixo à direita)", x + 246, y + h - 22, { size: 8, color: C.muted, width: 160 });
  return y + h;
}
const monthLabelShort = (value: string) => monthLabel(value);

function table(doc: Doc, x: number, y: number, w: number, head: string[], widths: number[], rows: string[][], aligns: Array<"left" | "right">) {
  doc.roundedRect(x, y, w, 20, 5).fill(C.navy);
  let cx = x;
  head.forEach((label, index) => { text(doc, label, cx + 8, y + 6, { size: 8, bold: true, color: C.white, width: widths[index] - 12, align: aligns[index] }); cx += widths[index]; });
  let cy = y + 22;
  rows.forEach((row, rowIndex) => {
    if (rowIndex % 2 === 0) doc.rect(x, cy - 1, w, 17).fill(C.soft);
    let rx = x;
    row.forEach((cell, index) => {
      text(doc, fit(doc, cell, widths[index] - 14, 8.5), rx + 8, cy + 3, { size: 8.5, color: C.ink, width: widths[index] - 12, align: aligns[index], wrap: false });
      rx += widths[index];
    });
    cy += 17;
  });
  return cy + 4;
}

function callout(doc: Doc, x: number, y: number, w: number, item: Insight) {
  const inner = w - 28;
  const bodyH = heightOf(doc, item.text, inner, 9);
  const h = bodyH + 34;
  card(doc, x, y, w, h, C.white);
  doc.roundedRect(x, y, 5, h, 2).fill(TONES[item.tone]);
  text(doc, item.title, x + 16, y + 10, { size: 9.5, bold: true, color: TONES[item.tone], width: inner });
  text(doc, item.text, x + 16, y + 25, { size: 9, color: C.ink, width: inner });
  return y + h + 8;
}

function chips(doc: Doc, x: number, y: number, w: number, names: string[], maxY: number) {
  let cx = x;
  let cy = y;
  for (let index = 0; index < names.length; index += 1) {
    const rest = names.length - index;
    doc.font("Helvetica").fontSize(8);
    let label = names[index];
    let cwid = doc.widthOfString(label) + 16;
    if (cx + cwid > x + w) { cx = x; cy += 22; }
    // Última linha cheia: troca o que sobrou por "e mais N" em vez de passar da página
    if (cy + 17 > maxY && rest > 0) return cy;
    if (cy + 22 + 17 > maxY && cx + cwid + 90 > x + w && rest > 1) { label = `e mais ${rest} municípios`; doc.font("Helvetica").fontSize(8); cwid = doc.widthOfString(label) + 16; doc.roundedRect(cx, cy, cwid, 17, 8.5).fill("#fdebc8"); text(doc, label, cx + 8, cy + 5, { size: 8, color: "#9a6a00", width: cwid }); return cy + 24; }
    doc.roundedRect(cx, cy, cwid, 17, 8.5).fill("#e6edfb");
    text(doc, label, cx + 8, cy + 5, { size: 8, color: C.blue, width: cwid });
    cx += cwid + 6;
  }
  return cy + 24;
}

const periodText = (params: ReportParams) => `${dateBr(params.from)} a ${dateBr(params.to)}`;

/** Gera o PDF do relatório gerencial. Devolve os bytes do arquivo. */
export function renderRegionalReport(data: RegionalData, params: ReportParams, cityNames: string[], generatedAt = new Date()): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 0, bufferPages: true, info: { Title: `Relatório gerencial · ${params.regionName}`, Author: "Nexo Público", Subject: "Compras públicas por região" } });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => { doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });
  const t = data.totals;
  const insights = buildInsights(data, params);

  // ── Capa e resumo
  doc.rect(0, 0, W, 330).fill(C.navy);
  doc.save().fillOpacity(0.14).circle(W - 60, 60, 150).fill(C.blue).restore();
  doc.save().fillOpacity(0.18).circle(40, 300, 110).fill(C.teal).restore();
  doc.save().fillOpacity(0.12).circle(W - 150, 290, 60).fill(C.amber).restore();
  text(doc, "NEXO PÚBLICO · INTELIGÊNCIA EM COMPRAS PÚBLICAS", M, 44, { size: 8.5, bold: true, color: "#9fb4e6", width: CW });
  text(doc, "Relatório gerencial", M, 78, { size: 38, bold: true, color: C.white, width: CW });
  text(doc, params.regionName, M, 128, { size: 20, color: "#dbe5ff", width: CW });
  text(doc, "Condições comerciais das compras públicas da região: o quê, quando, quanto, onde e de que forma.", M, 166, { size: 11, color: "#b8c7ec", width: CW - 120 });
  text(doc, `Período: ${periodText(params)}`, M, 218, { size: 10.5, bold: true, color: C.white, width: CW });
  text(doc, `${intFmt.format(cityNames.length)} municípios${params.itemKind ? ` · só ${params.itemKind === "material" ? "materiais" : "serviços"}` : ""} · gerado em ${generatedAt.toLocaleDateString("pt-BR")}`, M, 235, { size: 9.5, color: "#b8c7ec", width: CW });
  const kw = (CW - 18) / 4;
  kpi(doc, M, 296, kw, "Licitações publicadas", intFmt.format(t.procurements), `${intFmt.format(t.agencies)} órgãos compradores`, C.blue);
  kpi(doc, M + kw + 6, 296, kw, "Valor movimentado", brl(t.value), `mediana ${brl(t.medianValue)}`, C.teal);
  kpi(doc, M + (kw + 6) * 2, 296, kw, "Itens licitados", intFmt.format(t.items), "itens com descrição e quantidade", C.amber);
  kpi(doc, M + (kw + 6) * 3, 296, kw, "Municípios", intFmt.format(t.cities), "com licitações no período", C.coral);
  let y = subtitle(doc, "Resumo executivo", M, 392, CW, "As cinco perguntas, respondidas com os dados do período");
  for (const item of insights.summary) y = callout(doc, M, y, CW, item);
  text(doc, "A lista dos municípios incluídos e a metodologia estão na última página.", M, y + 4, { size: 8.5, color: C.muted, width: CW });

  // ── O quê?
  doc.addPage();
  sectionHeader(doc, "O quê?", "Que produtos e serviços as prefeituras e órgãos da região compram", C.coral);
  y = 112;
  const half = (CW - 20) / 2;
  const niches = data.byNiche.slice(0, 6);
  const otherNiches = data.byNiche.slice(6).reduce((sum, row) => sum + row.items, 0);
  const byValue = [...data.byNiche].sort((a, b) => b.value - a.value);
  const otherValue = byValue.slice(6).reduce((sum, row) => sum + row.value, 0);
  y = subtitle(doc, "Categorias mais compradas", M, y, half, "Participação nos itens classificados");
  subtitle(doc, "Onde está o dinheiro", M + half + 20, 112, half, "Valor estimado dos itens, por categoria");
  const donutY = y;
  donut(doc, M, donutY, half, [...niches.map((row) => ({ label: row.name, value: row.items })), ...(otherNiches > 0 ? [{ label: "Demais categorias", value: otherNiches }] : [])]);
  const bottom = donut(doc, M + half + 20, donutY, half, [...byValue.slice(0, 6).map((row) => ({ label: row.name, value: row.value })), ...(otherValue > 0 ? [{ label: "Demais categorias", value: otherValue }] : [])], undefined, (value) => brl(value));
  y = bottom + 14;
  y = subtitle(doc, "Produtos que aparecem em mais licitações", M, y, CW, "Itens iguais com descrições diferentes foram agrupados; ordenado pelo número de licitações");
  y = hbar(doc, M, y, CW, data.topProducts.slice(0, 10).map((row) => ({ label: row.name, value: row.procurements, display: `${intFmt.format(row.procurements)} lic.`, sub: `${row.niche} · ${brl(row.value)} estimados` })), C.coral, 190);
  y += 6;
  if (data.byNiche[0]) callout(doc, M, y, CW, { tone: "coral", title: "Leitura", text: `${data.byNiche[0].name} é a categoria com mais itens (${intFmt.format(data.byNiche[0].items)}) e ${data.byNiche.length > 1 ? `${data.byNiche[1].name} vem em seguida (${intFmt.format(data.byNiche[1].items)})` : "domina o período"}. Itens sem classificação não entram neste gráfico.` });

  // ── Quando?
  doc.addPage();
  sectionHeader(doc, "Quando?", "Ritmo de publicação das licitações ao longo do período", C.amber);
  y = subtitle(doc, "Evolução mês a mês", M, 112, CW, "Barras: quantidade de licitações · Linha: valor movimentado");
  y = columns(doc, M, y, CW, 226, data.monthly.map((row) => ({ label: row.month, count: row.count, value: row.value })));
  y += 18;
  const avgMonth = data.monthly.length ? t.procurements / data.monthly.length : 0;
  const peak = [...data.monthly].sort((a, b) => b.count - a.count)[0];
  const richest = [...data.monthly].sort((a, b) => b.value - a.value)[0];
  const k3 = (CW - 12) / 3;
  kpi(doc, M, y, k3, "Média mensal", `${intFmt.format(Math.round(avgMonth))} licitações`, `${data.monthly.length} meses analisados`, C.blue);
  kpi(doc, M + k3 + 6, y, k3, "Mês de maior volume", peak ? monthLabel(peak.month) : "—", peak ? `${intFmt.format(peak.count)} licitações` : "", C.amber);
  kpi(doc, M + (k3 + 6) * 2, y, k3, "Prazo para proposta", `${Math.round(t.avgDeadlineDays)} dias`, "média entre publicação e abertura", C.teal);
  y += 84;
  if (richest) y = callout(doc, M, y, CW, { tone: "amber", title: "Onde está o dinheiro no tempo", text: `O mês de maior valor movimentado foi ${monthLabel(richest.month)}, com ${brl(richest.value)}. Meses com pouca quantidade mas muito valor indicam poucas licitações grandes; compare a barra com a linha.` });
  const rows = data.monthly.slice(-11).map((row) => [monthLabel(row.month), intFmt.format(row.count), brl(row.value), row.count ? brl(row.value / row.count) : "—"]);
  y = subtitle(doc, "Números por mês", M, y + 4, CW);
  table(doc, M, y, CW, ["Mês", "Licitações", "Valor movimentado", "Valor médio"], [90, 110, CW - 310, 110], rows, ["left", "right", "right", "right"]);

  // ── Quanto?
  doc.addPage();
  sectionHeader(doc, "Quanto?", "Tamanho das contratações e onde está o valor", C.teal);
  y = 112;
  const kq = (CW - 12) / 3;
  kpi(doc, M, y, kq, "Valor movimentado", brl(t.value), "homologado ou estimado", C.teal);
  kpi(doc, M + kq + 6, y, kq, "Valor mediano", brl(t.medianValue), "metade das licitações vale menos", C.blue);
  kpi(doc, M + (kq + 6) * 2, y, kq, "Valor médio", brl(t.avgValue), "puxado pelas licitações grandes", C.amber);
  y += 92;
  y = subtitle(doc, "Licitações por faixa de valor", M, y, CW, "Quantas licitações cabem em cada faixa");
  const ranges = [
    { label: "Até R$ 50 mil", value: data.ranges.upTo50k }, { label: "R$ 50 mil a R$ 250 mil", value: data.ranges.upTo250k },
    { label: "R$ 250 mil a R$ 1 milhão", value: data.ranges.upTo1m }, { label: "Acima de R$ 1 milhão", value: data.ranges.above1m }, { label: "Sem valor informado", value: data.ranges.noValue },
  ];
  y = hbar(doc, M, y, CW, ranges.map((row) => ({ label: row.label, value: row.value, display: `${intFmt.format(row.value)} (${percent(row.value, t.procurements)})` })), C.teal, 150);
  y += 10;
  y = subtitle(doc, "As 10 maiores licitações do período", M, y, CW, "Valor homologado ou estimado");
  y = table(doc, M, y, CW, ["Valor", "Município", "Objeto"], [80, 110, CW - 190], data.topProcurements.map((row) => [brl(row.value), row.city, row.object]), ["right", "left", "left"]);
  y += 8;
  if (t.outliers > 0) y = callout(doc, M, y, CW, { tone: "coral", title: "Valores atípicos ficaram de fora", text: `${intFmt.format(t.outliers)} ${t.outliers === 1 ? "licitação tem valor" : "licitações têm valores"} a partir de R$ 200 milhões (somariam ${brl(t.outlierValue)}), muito acima do padrão da região e quase sempre erro de digitação nos portais. Contam na quantidade, mas não nos valores.` });

  // ── Onde?
  doc.addPage();
  sectionHeader(doc, "Onde?", "Municípios e órgãos que mais compram", C.blue);
  y = subtitle(doc, "Municípios por valor movimentado", M, 112, CW, "Os 10 maiores da região");
  y = hbar(doc, M, y, CW, data.byCity.slice(0, 10).map((row) => ({ label: row.name, value: row.value, display: brl(row.value), sub: `${intFmt.format(row.count)} licitações · ${intFmt.format(row.items)} itens` })), C.blue, 150);
  y += 8;
  y = subtitle(doc, "Órgãos que mais compram", M, y, CW, "Por valor movimentado");
  y = hbar(doc, M, y, CW, data.topAgencies.slice(0, 8).map((row) => ({ label: row.name, value: row.value, display: brl(row.value), sub: `${intFmt.format(row.count)} licitações` })), C.violet, 220);
  if (data.byCity.length > 10) {
    doc.addPage();
    sectionHeader(doc, "Onde?", "Todos os municípios do recorte", C.blue);
    const body = data.byCity.slice(0, 40).map((row) => [row.name, intFmt.format(row.count), intFmt.format(row.items), brl(row.value), row.count ? brl(row.value / row.count) : "—"]);
    y = table(doc, M, 112, CW, ["Município", "Licitações", "Itens", "Valor", "Valor médio"], [CW - 330, 70, 70, 100, 90], body, ["left", "right", "right", "right", "right"]);
    if (data.byCity.length > 40) text(doc, `Mostrando os 40 maiores de ${data.byCity.length} municípios.`, M, y + 2, { size: 8, color: C.muted, width: CW });
  }

  // ── De que forma?
  doc.addPage();
  sectionHeader(doc, "De que forma?", "Modalidades, disputa e benefícios para pequenas empresas", C.violet);
  y = 112;
  subtitle(doc, "Modalidade de contratação", M, y, half, "Participação nas licitações");
  subtitle(doc, "Benefício para ME/EPP", M + half + 20, y, half, `Entre as que informam (${percent(data.byMeEpp.filter((row) => row.name === "não informado").reduce((sum, row) => sum + row.count, 0), t.procurements)} sem informação)`);
  const top = donut(doc, M, y + 34, half, data.byModality.slice(0, 7).map((row) => ({ label: row.name, value: row.count })));
  const knownMeEpp = data.byMeEpp.filter((row) => row.name !== "não informado");
  donut(doc, M + half + 20, y + 34, half, knownMeEpp.map((row) => ({ label: MEEPP_LABELS[row.name] ?? row.name, value: row.count })));
  y = top + 16;
  y = subtitle(doc, "Modo de disputa", M, y, CW, "Como os lances acontecem");
  y = hbar(doc, M, y, CW, data.byDispute.slice(0, 6).map((row) => ({ label: row.name, value: row.count, display: `${intFmt.format(row.count)} (${percent(row.count, t.procurements)})` })), C.violet, 190);
  y += 6;
  y = subtitle(doc, "Portal onde a licitação acontece", M, y, CW, "Onde o fornecedor precisa estar cadastrado");
  y = hbar(doc, M, y, CW, data.byPortal.slice(0, 6).map((row) => ({ label: row.name, value: row.count, display: `${intFmt.format(row.count)} (${percent(row.count, t.procurements)})` })), C.cyan, 190);

  // ── Quem vence? + considerações
  doc.addPage();
  sectionHeader(doc, "Quem vence?", "Fornecedores com mais valor em resultados homologados", C.teal);
  y = subtitle(doc, "Fornecedores vencedores", M, 112, CW, "Considera só licitações com resultado já homologado e publicado");
  if (data.topSuppliers.length) y = hbar(doc, M, y, CW, data.topSuppliers.slice(0, 10).map((row) => ({ label: row.name, value: row.value, display: brl(row.value), sub: `${intFmt.format(row.wins)} ${row.wins === 1 ? "item vencido" : "itens vencidos"}` })), C.teal, 230);
  else { text(doc, "Ainda não há resultados homologados publicados para este recorte.", M, y, { size: 9.5, color: C.muted, width: CW }); y += 24; }
  y += 10;
  y = subtitle(doc, "Considerações para quem vende para a região", M, y, CW, "Leituras que ajudam a decidir onde e como atuar");
  for (const item of insights.considerations) { if (y > H - 120) { doc.addPage(); y = 60; } y = callout(doc, M, y, CW, item); }
  if (y > H - 170) { doc.addPage(); y = 60; }
  y += 6;
  if (y > H - 270) { doc.addPage(); y = 60; }
  y = subtitle(doc, "Municípios incluídos", M, y, CW, `${intFmt.format(cityNames.length)} municípios considerados neste relatório`);
  y = chips(doc, M, y, CW, cityNames, H - 150) + 6;
  card(doc, M, y, CW, 96, "#fff8e8");
  text(doc, "Como ler este relatório", M + 14, y + 10, { size: 9.5, bold: true, color: "#9a6a00", width: CW - 28 });
  text(doc, "Fonte: licitações publicadas no PNCP e no Compras.gov.br, reunidas no Nexo Público. Valor = homologado quando existe, senão o valor estimado da licitação; valores a partir de R$ 200 milhões por contratação são tratados como atípicos (erros de digitação) e ficam fora dos valores. Resultados e fornecedores aparecem só quando já foram homologados e publicados. A cobertura do período depende da carga de dados concluída no momento da geração; o relatório mostra o que está na base e não substitui a consulta ao edital.", M + 14, y + 26, { size: 8.5, color: C.ink, width: CW - 28 });

  // ── Rodapé em todas as páginas (menos a capa)
  const range = doc.bufferedPageRange();
  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(range.start + index);
    if (index === 0) continue;
    doc.moveTo(M, H - 30).lineTo(W - M, H - 30).lineWidth(0.5).stroke(C.line);
    text(doc, `Nexo Público · Relatório gerencial · ${params.regionName} · ${periodText(params)}`, M, H - 22, { size: 7.5, color: C.muted, width: CW - 60 });
    text(doc, `${index + 1} / ${range.count}`, W - M - 50, H - 22, { size: 7.5, color: C.muted, width: 50, align: "right" });
  }
  doc.end();
  return done;
}
