export interface ModelPricing {
  providerId: string;
  modelId: string;
  inputPerMillion: number;
  cachedInputPerMillion: number | null;
  outputPerMillion: number;
  effectiveDate: string;
  source: string;
}

export interface UsageRecord {
  inputTokens: number;
  cachedInputTokens: number | null;
  outputTokens: number;
  totalTokens: number;
}

export interface EstimatedCost {
  available: boolean;
  amountUsd: number | null;
  assumption: "exact_token_breakdown" | "assumes_uncached_input" | "pre_call_maximum" | null;
  missingReason: string | null;
}

export interface CostBudget {
  enforcement: "HARD" | "SOFT";
  maxUsd: number | null;
  expectedInputTokens: number | null;
  expectedOutputTokens: number | null;
}
