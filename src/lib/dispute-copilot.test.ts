import { describe, expect, it } from "vitest";
import { decrementStep, floorPrice, parseMoney, recommendBid, type BidStrategyNumbers } from "@/lib/dispute-copilot";

const base: BidStrategyNumbers = { unitCost: 100, minMarginPct: 10, minDecrement: 0.5, decrementType: "valor" };

describe("dispute copilot", () => {
  it("calcula o piso como custo + margem, arredondando para cima", () => {
    expect(floorPrice(base)).toBe(110);
    expect(floorPrice({ ...base, unitCost: 10.333, minMarginPct: 7 })).toBe(11.06);
  });

  it("calcula o intervalo mínimo em valor ou percentual", () => {
    expect(decrementStep(base, 200)).toBe(0.5);
    expect(decrementStep({ ...base, minDecrement: 1, decrementType: "percentual" }, 250)).toBe(2.5);
    expect(decrementStep({ ...base, minDecrement: 0.001 }, 10)).toBe(0.01);
  });

  it("recomenda cobrir o melhor lance respeitando o intervalo", () => {
    const result = recommendBid(base, 150);
    expect(result.status).toBe("cobrir");
    expect(result.recommended).toBe(149.5);
    expect(result.marginPct).toBeCloseTo(49.5);
  });

  it("avisa quando o próximo lance está perto do piso", () => {
    const result = recommendBid(base, 111);
    expect(result.status).toBe("limite");
    expect(result.recommended).toBe(110.5);
  });

  it("manda parar quando cobrir exigiria ficar abaixo do piso", () => {
    const result = recommendBid(base, 110.2);
    expect(result.status).toBe("parar");
    expect(result.recommended).toBeNull();
  });

  it("não recomenda novo lance quando o usuário já lidera", () => {
    const result = recommendBid(base, 140, 140);
    expect(result.status).toBe("lider");
    expect(result.recommended).toBeNull();
  });

  it("sugere o lance inicial, nunca abaixo do piso", () => {
    expect(recommendBid({ ...base, openingBid: 180 }, null).recommended).toBe(180);
    expect(recommendBid({ ...base, openingBid: 90 }, null).recommended).toBe(110);
  });

  it("lê valores no formato brasileiro e com ponto decimal", () => {
    expect(parseMoney("1.234,56")).toBe(1234.56);
    expect(parseMoney("R$ 99,9")).toBe(99.9);
    expect(parseMoney("1234.5")).toBe(1234.5);
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("")).toBeNull();
  });
});
