import { describe, expect, it } from "vitest";
import { enforceContextBudget, type ContextBudget, type EvidenceItem } from "./budget";

const budget: ContextBudget = { maxInputTokens: 1_000, maxEvidenceItems: 2, maxEvidenceTokens: 800, reserveOutputTokens: 200, truncationPolicy: "OMIT_LOW_AUTHORITY" };
const item = (id: string, authority: EvidenceItem["authority"], estimatedTokens: number, required = false): EvidenceItem => ({ id, authority, estimatedTokens, required, content: `${id}-raw` });

describe("deterministic context budgeting", () => {
  it("reports a fitting packet and respects reserved output", () => {
    expect(enforceContextBudget([item("one", "CANONICAL", 400)], budget)).toMatchObject({ packet: { budgetStatus: "FIT", estimatedTokens: 400 }, telemetry: { rawEvidenceItemCount: 1, omittedItemCount: 0 } });
    expect(enforceContextBudget([item("too-large", "CANONICAL", 801, true)], budget).packet.budgetStatus).toBe("REJECTED");
  });

  it("omits deterministically while preserving required and high-authority evidence", () => {
    const result = enforceContextBudget([item("history", "HISTORICAL", 300), item("required", "REQUIRED", 300, true), item("canonical", "CANONICAL", 300)], budget);
    expect(result.packet).toMatchObject({ budgetStatus: "TRUNCATED", items: [{ id: "required" }, { id: "canonical" }], omittedItems: [{ id: "history" }] });
    expect(result.telemetry).toMatchObject({ rawEvidenceItemCount: 3, rawEstimatedTokens: 900, finalPacketItemCount: 2, finalEstimatedTokens: 600, omittedItemCount: 1 });
    expect(result.telemetry.reductionPercentage).toBeCloseTo(33.333333, 5);
  });

  it("reports rejection instead of silently omitting required evidence", () => {
    const result = enforceContextBudget([item("required", "REQUIRED", 900, true)], budget);
    expect(result).toMatchObject({ packet: { budgetStatus: "REJECTED", items: [], omittedItems: [{ id: "required" }] }, reasons: [expect.stringContaining("Required evidence")] });
  });

  it("supports an explicit reject policy and deterministic zero-token telemetry", () => {
    expect(enforceContextBudget([item("a", "CANONICAL", 500), item("b", "SUPPORTING", 500)], { ...budget, truncationPolicy: "REJECT" }).packet.budgetStatus).toBe("REJECTED");
    expect(enforceContextBudget([], budget).telemetry.reductionPercentage).toBeNull();
  });
});
