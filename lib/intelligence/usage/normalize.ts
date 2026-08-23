import type { UsageRecord } from "../pricing/types";

export interface ProviderNeutralUsageInput { inputTokens: number; cachedInputTokens?: number | null; outputTokens: number }

export function normalizeUsage(input: ProviderNeutralUsageInput): UsageRecord {
  if (![input.inputTokens, input.outputTokens].every((value) => Number.isInteger(value) && value >= 0)) throw new Error("Token usage must contain non-negative integers.");
  if (input.cachedInputTokens !== undefined && input.cachedInputTokens !== null && (!Number.isInteger(input.cachedInputTokens) || input.cachedInputTokens < 0 || input.cachedInputTokens > input.inputTokens)) throw new Error("Cached input tokens must be within aggregate input tokens.");
  return { inputTokens: input.inputTokens, cachedInputTokens: input.cachedInputTokens ?? null, outputTokens: input.outputTokens, totalTokens: input.inputTokens + input.outputTokens };
}
