export interface PoAgentUsageMetadata {
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  cachedInputTokens: number | null;
  uncachedInputTokens: number | null;
  estimatedCostUsd: number | null;
  costLabel: "ESTIMATED";
  costAssumption: "sdk_cached_input_breakdown" | "assumes_uncached_input" | null;
  costLimitation: string | null;
}

export interface ModelPricing {
  model: string;
  inputPerMillion: number;
  cachedInputPerMillion: number;
  outputPerMillion: number;
  effectiveDate: string;
  source: string;
}

const reviewedPricingSource = "GOV-PO-AGENT-001 Phase B closeout pricing review";
export const poAgentModelPricing: Readonly<Record<string, ModelPricing>> = {
  "gpt-5.6-sol": { model: "gpt-5.6-sol", inputPerMillion: 5, cachedInputPerMillion: 0.5, outputPerMillion: 30, effectiveDate: "2026-08-23", source: reviewedPricingSource },
  "gpt-5.6-terra": { model: "gpt-5.6-terra", inputPerMillion: 2, cachedInputPerMillion: 0.2, outputPerMillion: 12, effectiveDate: "2026-08-23", source: reviewedPricingSource },
  "gpt-5.6-luna": { model: "gpt-5.6-luna", inputPerMillion: 0.2, cachedInputPerMillion: 0.02, outputPerMillion: 1.2, effectiveDate: "2026-08-23", source: reviewedPricingSource },
};

interface AgentUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  inputTokensDetails?: Array<Record<string, number>>;
}

export function buildUsageMetadata(model: string, usage?: AgentUsage | null): PoAgentUsageMetadata {
  const usageAvailable = Boolean(usage && (usage.totalTokens > 0 || usage.inputTokens > 0 || usage.outputTokens > 0));
  const pricing = poAgentModelPricing[model];
  const cachedBreakdownAvailable = Boolean(usage?.inputTokensDetails?.some((details) => Object.hasOwn(details, "cached_tokens")));
  const cachedInputTokens = cachedBreakdownAvailable ? usage!.inputTokensDetails!.reduce((total, details) => total + (details.cached_tokens ?? 0), 0) : null;
  const validCachedBreakdown = cachedInputTokens === null || cachedInputTokens <= usage!.inputTokens;
  const uncachedInputTokens = usageAvailable ? usage!.inputTokens - (cachedInputTokens ?? 0) : null;
  const estimatedCostUsd = usageAvailable && pricing && validCachedBreakdown
    ? ((uncachedInputTokens! * pricing.inputPerMillion) + ((cachedInputTokens ?? 0) * pricing.cachedInputPerMillion) + (usage!.outputTokens * pricing.outputPerMillion)) / 1_000_000
    : null;
  return {
    model,
    inputTokens: usageAvailable ? usage!.inputTokens : null,
    outputTokens: usageAvailable ? usage!.outputTokens : null,
    totalTokens: usageAvailable ? usage!.totalTokens : null,
    cachedInputTokens: usageAvailable ? cachedInputTokens : null,
    uncachedInputTokens,
    estimatedCostUsd,
    costLabel: "ESTIMATED",
    costAssumption: estimatedCostUsd === null ? null : cachedBreakdownAvailable ? "sdk_cached_input_breakdown" : "assumes_uncached_input",
    costLimitation: !usageAvailable
      ? "The SDK/provider did not report token usage for this response."
      : !pricing ? `No reviewed pricing metadata is configured for ${model}; estimated cost is unavailable.`
        : !validCachedBreakdown ? "SDK cached-input detail exceeds aggregate input tokens; estimated cost is unavailable." : null,
  };
}

export function accumulateSessionEstimatedCost(current: number | null, responseCost: number | null) {
  if (current === null || responseCost === null) return null;
  return current + responseCost;
}
