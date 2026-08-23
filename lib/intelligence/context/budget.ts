export const evidenceAuthorities = ["REQUIRED", "CANONICAL", "CURRENT_REPOSITORY", "SUPPORTING", "HISTORICAL"] as const;
export type EvidenceAuthority = (typeof evidenceAuthorities)[number];
export type ContextBudgetStatus = "FIT" | "TRUNCATED" | "REJECTED";

export interface EvidenceItem {
  id: string;
  authority: EvidenceAuthority;
  required: boolean;
  estimatedTokens: number;
  content: unknown;
}

export interface EvidencePacket {
  items: EvidenceItem[];
  estimatedTokens: number;
  omittedItems: EvidenceItem[];
  budgetStatus: ContextBudgetStatus;
}

export interface ContextBudget {
  maxInputTokens: number;
  maxEvidenceItems: number;
  maxEvidenceTokens: number;
  reserveOutputTokens: number;
  truncationPolicy: "OMIT_LOW_AUTHORITY" | "REJECT";
}

export interface ContextTelemetry {
  rawEvidenceItemCount: number;
  rawEstimatedTokens: number;
  finalPacketItemCount: number;
  finalEstimatedTokens: number;
  omittedItemCount: number;
  reductionPercentage: number | null;
  budgetStatus: ContextBudgetStatus;
}

export interface ContextBudgetResult { packet: EvidencePacket; telemetry: ContextTelemetry; reasons: string[] }

const authorityRank: Record<EvidenceAuthority, number> = { REQUIRED: 0, CANONICAL: 1, CURRENT_REPOSITORY: 2, SUPPORTING: 3, HISTORICAL: 4 };

export function enforceContextBudget(rawItems: EvidenceItem[], budget: ContextBudget): ContextBudgetResult {
  const rawEstimatedTokens = rawItems.reduce((total, item) => total + item.estimatedTokens, 0);
  const availableInputTokens = Math.max(0, budget.maxInputTokens - budget.reserveOutputTokens);
  const tokenLimit = Math.min(availableInputTokens, budget.maxEvidenceTokens);
  const fits = rawItems.length <= budget.maxEvidenceItems && rawEstimatedTokens <= tokenLimit;
  if (fits) return result(rawItems, [], "FIT", rawEstimatedTokens, []);
  if (budget.truncationPolicy === "REJECT") return result([], rawItems, "REJECTED", rawEstimatedTokens, ["Evidence exceeds the configured context budget; reject policy forbids omission."]);

  const prioritized = rawItems.map((item, index) => ({ item, index })).sort((left, right) => {
    if (left.item.required !== right.item.required) return left.item.required ? -1 : 1;
    return authorityRank[left.item.authority] - authorityRank[right.item.authority] || left.index - right.index;
  });
  const selected: Array<{ item: EvidenceItem; index: number }> = [];
  const omitted: Array<{ item: EvidenceItem; index: number }> = [];
  let tokens = 0;
  for (const entry of prioritized) {
    if (selected.length < budget.maxEvidenceItems && tokens + entry.item.estimatedTokens <= tokenLimit) {
      selected.push(entry);
      tokens += entry.item.estimatedTokens;
    } else omitted.push(entry);
  }
  if (omitted.some(({ item }) => item.required)) return result([], rawItems, "REJECTED", rawEstimatedTokens, ["Required evidence cannot fit without omission."]);
  return result(selected.sort((a, b) => a.index - b.index).map(({ item }) => item), omitted.sort((a, b) => a.index - b.index).map(({ item }) => item), "TRUNCATED", rawEstimatedTokens, ["Lower-authority evidence was deterministically omitted."]);
}

function result(items: EvidenceItem[], omittedItems: EvidenceItem[], budgetStatus: ContextBudgetStatus, rawEstimatedTokens: number, reasons: string[]): ContextBudgetResult {
  const finalEstimatedTokens = items.reduce((total, item) => total + item.estimatedTokens, 0);
  return {
    packet: { items, estimatedTokens: finalEstimatedTokens, omittedItems, budgetStatus },
    telemetry: {
      rawEvidenceItemCount: items.length + omittedItems.length,
      rawEstimatedTokens,
      finalPacketItemCount: items.length,
      finalEstimatedTokens,
      omittedItemCount: omittedItems.length,
      reductionPercentage: rawEstimatedTokens ? ((rawEstimatedTokens - finalEstimatedTokens) / rawEstimatedTokens) * 100 : null,
      budgetStatus,
    },
    reasons,
  };
}
