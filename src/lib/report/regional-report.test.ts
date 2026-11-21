import { describe, expect, it } from "vitest";
import { renderRegionalReport } from "./pdf-regional";
import { brl, buildInsights, normalizeData } from "./regional-report";

const params = { regionName: "Região de teste", cities: ["3543402"], from: "2026-01-01", to: "2026-06-30" };

const sample = normalizeData({
  totals: { procurements: "120", value: "5400000", avgValue: "45000", medianValue: "12000", agencies: 9, cities: 3, withoutValue: 2, outliers: 1, outlierValue: "900000000", avgDeadlineDays: "11.4", items: 300 },
  monthly: [{ month: "2026-01", count: 20, value: "800000" }, { month: "2026-02", count: 45, value: "2100000" }, { month: "2026-03", count: 55, value: "2500000" }],
  byCity: [{ ibge: "1", name: "Cidade A", count: 80, value: "4000000", items: 200 }, { ibge: "2", name: "Cidade B", count: 40, value: "1400000", items: 100 }],
  byModality: [{ name: "Dispensa", count: 70, value: "1000000" }, { name: "Pregão - Eletrônico", count: 50, value: "4400000" }],
  byMeEpp: [{ name: "exclusiva", count: 30 }, { name: "não informado", count: 90 }],
  ranges: { upTo50k: 90, upTo250k: 20, upTo1m: 6, above1m: 2, noValue: 2 },
  byNiche: [{ name: "Saúde e hospitalar", items: 120, value: "2000000", procurements: 40 }],
  topProducts: [{ name: "Papel sulfite", niche: "Escritório e papelaria", items: 12, procurements: 9, value: "50000" }],
});

describe("relatório gerencial regional", () => {
  it("formata valores em reais de forma curta", () => {
    expect(brl(950)).toBe("R$ 950");
    expect(brl(17_500)).toBe("R$ 17,5 mil");
    expect(brl(1_600_000)).toBe("R$ 1,6 mi");
    expect(brl(9_400_000_000)).toBe("R$ 9,40 bi");
  });

  it("explica o período vazio em vez de inventar números", () => {
    const { summary } = buildInsights(normalizeData({}), params);
    expect(summary).toHaveLength(1);
    expect(summary[0].title).toBe("Sem licitações no período");
  });

  it("responde às cinco perguntas e avisa sobre valores atípicos", () => {
    const { summary, considerations } = buildInsights(sample, params);
    expect(summary.map((item) => item.title)).toEqual(["Quanto", "Onde", "De que forma", "Quando", "O quê"]);
    expect(considerations.some((item) => item.title.includes("atípicos"))).toBe(true);
  });

  it("gera um PDF válido, também sem nenhum dado", async () => {
    const full = await renderRegionalReport(sample, params, ["Cidade A", "Cidade B"], new Date("2026-07-01T12:00:00Z"));
    expect(full.subarray(0, 5).toString()).toBe("%PDF-");
    expect(full.length).toBeGreaterThan(5_000);
    const empty = await renderRegionalReport(normalizeData({}), params, []);
    expect(empty.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
