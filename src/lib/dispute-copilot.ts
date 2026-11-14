// Regras do copiloto de disputa (sem dependências: roda no servidor, no navegador e nos testes).
// O Nexo só recomenda; o lance é digitado pelo usuário no portal oficial.

export type DecrementType = "valor" | "percentual";

export interface BidStrategyNumbers {
  unitCost: number;
  minMarginPct: number;
  minDecrement: number;
  decrementType: DecrementType;
  openingBid?: number | null;
}

export type BidStatus = "abrir" | "cobrir" | "limite" | "parar" | "lider";

export interface BidRecommendation {
  status: BidStatus;
  /** Valor sugerido para digitar no portal; null quando não há lance a dar. */
  recommended: number | null;
  floor: number;
  step: number;
  /** Margem sobre o custo no valor recomendado (ou no melhor lance, quando parar). */
  marginPct: number | null;
  /** Quanto o valor recomendado está acima do piso. */
  aboveFloor: number | null;
  message: string;
}

const cents = (value: number) => Math.round(value * 100) / 100;
const floorCents = (value: number) => Math.floor(value * 100 + 1e-6) / 100;
const ceilCents = (value: number) => Math.ceil(value * 100 - 1e-6) / 100;

/** Menor valor aceitável: custo + margem mínima, arredondado para cima no centavo. */
export function floorPrice(strategy: BidStrategyNumbers) {
  return ceilCents(strategy.unitCost * (1 + strategy.minMarginPct / 100));
}

/** Intervalo mínimo entre lances, em reais, a partir do valor de referência. */
export function decrementStep(strategy: BidStrategyNumbers, reference: number) {
  const raw = strategy.decrementType === "percentual" ? (reference * strategy.minDecrement) / 100 : strategy.minDecrement;
  return Math.max(0.01, ceilCents(raw));
}

function margin(strategy: BidStrategyNumbers, price: number) {
  return strategy.unitCost > 0 ? ((price - strategy.unitCost) / strategy.unitCost) * 100 : null;
}

/** Valores digitados em formato brasileiro ("1.234,56") ou com ponto decimal ("1234.56"). */
export function parseMoney(input: string): number | null {
  const text = input.trim().replace(/[R$\s]/g, "");
  if (!text) return null;
  const normalized = text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text;
  const value = Number(normalized);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export function recommendBid(strategy: BidStrategyNumbers, currentBest: number | null, myLastBid: number | null = null): BidRecommendation {
  const floor = floorPrice(strategy);

  if (currentBest === null) {
    const opening = strategy.openingBid && strategy.openingBid >= floor ? cents(strategy.openingBid) : floor;
    return {
      status: "abrir", recommended: opening, floor, step: decrementStep(strategy, opening),
      marginPct: margin(strategy, opening), aboveFloor: cents(opening - floor),
      message: strategy.openingBid && strategy.openingBid < floor
        ? "O lance inicial informado está abaixo do seu piso; use o piso como primeiro lance."
        : "Sugestão de primeiro lance. Informe o melhor lance do portal assim que a disputa começar.",
    };
  }

  const step = decrementStep(strategy, currentBest);

  if (myLastBid !== null && myLastBid <= currentBest) {
    return {
      status: "lider", recommended: null, floor, step, marginPct: margin(strategy, myLastBid), aboveFloor: cents(myLastBid - floor),
      message: "Seu lance é o melhor no momento. Aguarde: dar outro lance agora só reduz sua margem.",
    };
  }

  const candidate = floorCents(currentBest - step);
  if (candidate < floor) {
    return {
      status: "parar", recommended: null, floor, step, marginPct: margin(strategy, currentBest), aboveFloor: cents(currentBest - floor),
      message: `Para cobrir seria preciso ofertar ${candidate.toFixed(2).replace(".", ",")} ou menos, abaixo do seu piso. Pare aqui ou revise o custo.`,
    };
  }

  const nearLimit = candidate - floor <= Math.max(step, floor * 0.02);
  return {
    status: nearLimit ? "limite" : "cobrir",
    recommended: candidate, floor, step,
    marginPct: margin(strategy, candidate),
    aboveFloor: cents(candidate - floor),
    message: nearLimit
      ? "Este é praticamente o último lance antes do seu piso."
      : "Lance que cobre a melhor oferta respeitando o intervalo mínimo.",
  };
}
