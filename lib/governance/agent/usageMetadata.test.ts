import { describe, expect, it } from "vitest";
import { accumulateSessionEstimatedCost, buildUsageMetadata, poAgentModelPricing } from "./usageMetadata";

describe("PO Agent usage and estimated-cost metadata", () => {
  it("reproduces the accepted Sol telemetry with an uncached-input assumption", () => {
    const result = buildUsageMetadata("gpt-5.6-sol", { inputTokens: 27_705, outputTokens: 270, totalTokens: 27_975 });
    expect(result).toMatchObject({
      model: "gpt-5.6-sol", inputTokens: 27_705, outputTokens: 270, totalTokens: 27_975,
      cachedInputTokens: null, uncachedInputTokens: 27_705, costAssumption: "assumes_uncached_input", costLimitation: null,
    });
    expect(result.estimatedCostUsd).toBeCloseTo(0.146625, 10);
  });

  it.each([
    ["gpt-5.6-sol", 5, 0.5, 30],
    ["gpt-5.6-terra", 2, 0.2, 12],
    ["gpt-5.6-luna", 0.2, 0.02, 1.2],
  ])("uses isolated reviewed pricing for %s", (model, inputRate, cachedRate, outputRate) => {
    expect(poAgentModelPricing[model]).toMatchObject({ model, inputPerMillion: inputRate, cachedInputPerMillion: cachedRate, outputPerMillion: outputRate, effectiveDate: "2026-08-23" });
    expect(buildUsageMetadata(model, { inputTokens: 1_000_000, outputTokens: 1_000_000, totalTokens: 2_000_000 }).estimatedCostUsd).toBeCloseTo(inputRate + outputRate, 10);
  });

  it("prices cached and uncached input separately when the SDK breakdown exists", () => {
    const result = buildUsageMetadata("gpt-5.6-sol", { inputTokens: 1_000_000, outputTokens: 100_000, totalTokens: 1_100_000, inputTokensDetails: [{ cached_tokens: 400_000 }] });
    expect(result).toMatchObject({ cachedInputTokens: 400_000, uncachedInputTokens: 600_000, costAssumption: "sdk_cached_input_breakdown" });
    expect(result.estimatedCostUsd).toBeCloseTo(6.2, 10);
  });

  it("keeps unknown-model and missing-usage costs unavailable", () => {
    expect(buildUsageMetadata("unknown-model", { inputTokens: 100, outputTokens: 25, totalTokens: 125 })).toMatchObject({ estimatedCostUsd: null, costAssumption: null, costLimitation: expect.stringContaining("No reviewed pricing metadata") });
    expect(buildUsageMetadata("gpt-5.6-sol", { inputTokens: 0, outputTokens: 0, totalTokens: 0 })).toMatchObject({ inputTokens: null, estimatedCostUsd: null, costAssumption: null, costLimitation: expect.stringContaining("did not report") });
  });

  it("never turns an unavailable response estimate into a fake zero session total", () => {
    expect(accumulateSessionEstimatedCost(0, null)).toBeNull();
    expect(accumulateSessionEstimatedCost(null, 0.1)).toBeNull();
    expect(accumulateSessionEstimatedCost(0.1, 0.2)).toBeCloseTo(0.3, 10);
  });
});
