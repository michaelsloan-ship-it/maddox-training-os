import { describe, expect, it } from "vitest";
import { estimatePreCallCost, estimateUsageCost, PricingCatalog } from "./catalog";

const pricing = { providerId: "fixture", modelId: "model", inputPerMillion: 2, cachedInputPerMillion: 0.2, outputPerMillion: 10, effectiveDate: "2026-08-23", source: "fixture" };

describe("provider-neutral pricing catalog", () => {
  it("looks up exact provider/model pricing without a global best model", () => {
    const catalog = new PricingCatalog([pricing]);
    expect(catalog.get("fixture", "model")).toEqual(pricing);
    expect(catalog.get("fixture", "unknown")).toBeNull();
  });

  it("normalizes cached and uncached actual usage estimates", () => {
    expect(estimateUsageCost(pricing, { inputTokens: 1_000_000, cachedInputTokens: 400_000, outputTokens: 100_000, totalTokens: 1_100_000 })).toMatchObject({ available: true, amountUsd: 2.28, assumption: "exact_token_breakdown" });
    expect(estimateUsageCost(pricing, { inputTokens: 1_000_000, cachedInputTokens: null, outputTokens: 0, totalTokens: 1_000_000 })).toMatchObject({ available: true, amountUsd: 2, assumption: "assumes_uncached_input" });
  });

  it("keeps missing pricing and token estimates explicit", () => {
    expect(estimatePreCallCost(null, { enforcement: "HARD", maxUsd: 1, expectedInputTokens: 100, expectedOutputTokens: 50 })).toMatchObject({ available: false, amountUsd: null, missingReason: expect.stringContaining("Pricing") });
    expect(estimatePreCallCost(pricing, { enforcement: "SOFT", maxUsd: 1, expectedInputTokens: null, expectedOutputTokens: 50 })).toMatchObject({ available: false, missingReason: expect.stringContaining("token") });
  });
});
