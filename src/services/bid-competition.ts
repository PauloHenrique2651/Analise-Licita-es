export type CompetitionMethod = "exact_bids" | "historical_catalog" | "historical_description" | "insufficient_data";
export type CompetitionOutcome = "would_win" | "tie_first" | "would_rank" | "insufficient_data";
export type CompetitionConfidence = "confirmed" | "high" | "medium" | "low" | "insufficient";

export type CompetitionReference = {
  id: string;
  unitValue: number;
  procurementNumber: string | null;
  supplierName: string | null;
  observedAt: string | null;
  sourceUrl: string | null;
};

export type CompetitionAnalysis = {
  method: CompetitionMethod;
  isEstimate: boolean;
  outcome: CompetitionOutcome;
  projectedRank: number | null;
  confidence: CompetitionConfidence;
  referenceCount: number;
  tieCount: number;
  minimumPrice: number | null;
  medianPrice: number | null;
  maximumPrice: number | null;
  differenceToBest: number | null;
  differencePercentToBest: number | null;
  evidence: CompetitionReference[];
};

function finitePositive(value: number) {
  return Number.isFinite(value) && value > 0;
}

function median(values: number[]) {
  const middle = Math.floor(values.length / 2);
  return values.length % 2 === 0 ? (values[middle - 1] + values[middle]) / 2 : values[middle];
}

function insufficient(referenceCount: number, evidence: CompetitionReference[] = []): CompetitionAnalysis {
  return {
    method: "insufficient_data", isEstimate: true, outcome: "insufficient_data", projectedRank: null,
    confidence: "insufficient", referenceCount, tieCount: 0, minimumPrice: null, medianPrice: null,
    maximumPrice: null, differenceToBest: null, differencePercentToBest: null, evidence,
  };
}

function historicalConfidence(method: CompetitionMethod, references: number): CompetitionConfidence {
  if (references < 3) return "insufficient";
  if (method === "historical_catalog" && references >= 20) return "high";
  if (references >= 8) return "medium";
  return "low";
}

export function calculateCompetition(input: {
  offeredUnitValue: number;
  method: Exclude<CompetitionMethod, "insufficient_data">;
  references: CompetitionReference[];
  minimumReferences?: number;
}): CompetitionAnalysis {
  const references = input.references.filter((reference) => finitePositive(reference.unitValue));
  const minimumReferences = input.minimumReferences ?? (input.method === "exact_bids" ? 1 : 3);
  if (!finitePositive(input.offeredUnitValue) || references.length < minimumReferences) return insufficient(references.length, references.slice(0, 12));

  const prices = references.map((reference) => reference.unitValue).sort((left, right) => left - right);
  const best = prices[0];
  const lowerPrices = prices.filter((price) => price < input.offeredUnitValue).length;
  const ties = prices.filter((price) => price === input.offeredUnitValue).length;
  const projectedRank = lowerPrices + 1;
  const outcome: CompetitionOutcome = projectedRank === 1
    ? ties > 0 ? "tie_first" : "would_win"
    : "would_rank";

  return {
    method: input.method,
    isEstimate: input.method !== "exact_bids",
    outcome,
    projectedRank,
    confidence: input.method === "exact_bids" ? "confirmed" : historicalConfidence(input.method, references.length),
    referenceCount: references.length,
    tieCount: ties,
    minimumPrice: best,
    medianPrice: median(prices),
    maximumPrice: prices[prices.length - 1],
    differenceToBest: input.offeredUnitValue - best,
    differencePercentToBest: best ? ((input.offeredUnitValue - best) / best) * 100 : null,
    evidence: [...references].sort((left, right) => left.unitValue - right.unitValue).slice(0, 12),
  };
}
