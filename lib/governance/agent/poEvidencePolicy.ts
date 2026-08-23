import type { ContextBudget } from "@/lib/intelligence";
import type { IntelligenceTaskClass } from "@/lib/intelligence";

export type PoContextMode = "legacy" | "shadow" | "packed";

const defaultBudgets: Record<Extract<IntelligenceTaskClass, `po_${string}`>, ContextBudget> = {
  po_next_work_explanation: budget(6_000, 18, 4_500, 1_200),
  po_scope_explanation: budget(4_000, 12, 2_800, 900),
  po_scope_comparison: budget(6_000, 24, 4_500, 1_200),
  po_portfolio_synthesis: budget(7_500, 24, 5_800, 1_400),
  po_architecture_review: budget(7_000, 20, 5_300, 1_400),
};

export function getPoContextMode(environment: Record<string, string | undefined> = process.env): PoContextMode {
  const configured = environment.PO_AGENT_CONTEXT_MODE;
  return configured === "shadow" || configured === "packed" ? configured : "legacy";
}

export function getPoContextBudget(taskClass: IntelligenceTaskClass, environment: Record<string, string | undefined> = process.env): ContextBudget {
  const base = defaultBudgets[taskClass as keyof typeof defaultBudgets];
  if (!base) throw new Error(`No PO context budget exists for ${taskClass}.`);
  const suffix = taskClass.replace(/^po_/, "").toUpperCase();
  return {
    maxInputTokens: integer(environment[`PO_CONTEXT_${suffix}_MAX_INPUT_TOKENS`], base.maxInputTokens),
    maxEvidenceItems: integer(environment[`PO_CONTEXT_${suffix}_MAX_EVIDENCE_ITEMS`], base.maxEvidenceItems),
    maxEvidenceTokens: integer(environment[`PO_CONTEXT_${suffix}_MAX_EVIDENCE_TOKENS`], base.maxEvidenceTokens),
    reserveOutputTokens: integer(environment[`PO_CONTEXT_${suffix}_RESERVE_OUTPUT_TOKENS`], base.reserveOutputTokens),
    truncationPolicy: base.truncationPolicy,
  };
}

function budget(maxInputTokens: number, maxEvidenceItems: number, maxEvidenceTokens: number, reserveOutputTokens: number): ContextBudget {
  return { maxInputTokens, maxEvidenceItems, maxEvidenceTokens, reserveOutputTokens, truncationPolicy: "OMIT_LOW_AUTHORITY" };
}

function integer(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
