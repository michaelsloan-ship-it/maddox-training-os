import type { CostBudget, EstimatedCost, ModelPricing, UsageRecord } from "./types";

export class PricingCatalog {
  private readonly entries = new Map<string, ModelPricing>();
  constructor(pricing: ModelPricing[] = []) { for (const entry of pricing) this.entries.set(key(entry.providerId, entry.modelId), entry); }
  get(providerId: string, modelId: string) { return this.entries.get(key(providerId, modelId)) ?? null; }
}

export function estimateUsageCost(pricing: ModelPricing | null, usage: UsageRecord): EstimatedCost {
  if (!pricing) return unavailable("Pricing metadata is unavailable.");
  const cached = usage.cachedInputTokens;
  if (cached !== null && (cached < 0 || cached > usage.inputTokens)) return unavailable("Cached input tokens are inconsistent with aggregate input tokens.");
  const uncached = usage.inputTokens - (cached ?? 0);
  const amountUsd = ((uncached * pricing.inputPerMillion) + ((cached ?? 0) * (pricing.cachedInputPerMillion ?? pricing.inputPerMillion)) + (usage.outputTokens * pricing.outputPerMillion)) / 1_000_000;
  return { available: true, amountUsd, assumption: cached === null ? "assumes_uncached_input" : "exact_token_breakdown", missingReason: null };
}

export function estimatePreCallCost(pricing: ModelPricing | null, budget: CostBudget): EstimatedCost {
  if (!pricing) return unavailable("Pricing metadata is unavailable.");
  if (budget.expectedInputTokens === null || budget.expectedOutputTokens === null) return unavailable("Expected token counts are unavailable.");
  return {
    available: true,
    amountUsd: ((budget.expectedInputTokens * pricing.inputPerMillion) + (budget.expectedOutputTokens * pricing.outputPerMillion)) / 1_000_000,
    assumption: "pre_call_maximum",
    missingReason: null,
  };
}

function unavailable(missingReason: string): EstimatedCost { return { available: false, amountUsd: null, assumption: null, missingReason }; }
function key(providerId: string, modelId: string) { return `${providerId}:${modelId}`; }
