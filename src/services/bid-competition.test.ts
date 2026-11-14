import { describe, expect, it } from "vitest";
import { calculateCompetition, type CompetitionReference } from "./bid-competition";

const references: CompetitionReference[] = [
  { id: "one", unitValue: 10, procurementNumber: "PE 1", supplierName: "A", observedAt: null, sourceUrl: null },
  { id: "two", unitValue: 12, procurementNumber: "PE 2", supplierName: "B", observedAt: null, sourceUrl: null },
  { id: "three", unitValue: 14, procurementNumber: "PE 3", supplierName: "C", observedAt: null, sourceUrl: null },
];

describe("calculateCompetition", () => {
  it("classifies a lower offer as first place", () => {
    const result = calculateCompetition({ offeredUnitValue: 9, method: "historical_catalog", references });
    expect(result.outcome).toBe("would_win");
    expect(result.projectedRank).toBe(1);
    expect(result.minimumPrice).toBe(10);
  });

  it("keeps a tie in first place distinct from a win", () => {
    const result = calculateCompetition({ offeredUnitValue: 10, method: "exact_bids", references });
    expect(result.outcome).toBe("tie_first");
    expect(result.projectedRank).toBe(1);
    expect(result.tieCount).toBe(1);
  });

  it("calculates the position after strictly lower prices", () => {
    const result = calculateCompetition({ offeredUnitValue: 13, method: "historical_catalog", references });
    expect(result.outcome).toBe("would_rank");
    expect(result.projectedRank).toBe(3);
    expect(result.differenceToBest).toBe(3);
  });

  it("does not invent a historical projection with too few references", () => {
    const result = calculateCompetition({ offeredUnitValue: 9, method: "historical_description", references: references.slice(0, 2) });
    expect(result.outcome).toBe("insufficient_data");
    expect(result.projectedRank).toBeNull();
  });
});
