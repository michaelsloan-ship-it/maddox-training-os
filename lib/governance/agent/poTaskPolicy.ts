import type { IntelligenceTaskClass } from "@/lib/intelligence";

export type PoTaskClassificationStatus = "supported" | "ambiguous" | "unsupported";

export interface PoTaskClassification {
  status: PoTaskClassificationStatus;
  taskClass: IntelligenceTaskClass | null;
  scopeIds: string[];
  reason: string;
}

const scopeIdPattern = /\b[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+\b/g;

export function classifyPoTask(question: string): PoTaskClassification {
  const normalized = question.trim().toLowerCase();
  const scopeIds = Array.from(new Set(question.match(scopeIdPattern) ?? []));
  const matches: IntelligenceTaskClass[] = [];

  if (/\b(?:what|which)\b[^?]{0,60}\b(?:work on next|next work|do next|next priority)\b/.test(normalized)) matches.push("po_next_work_explanation");
  if (/\bcompare\b|\bversus\b|\bvs\.?\b/.test(normalized)) matches.push("po_scope_comparison");
  if (/\b(?:explain|describe|what is|tell me about)\b/.test(normalized) && scopeIds.length === 1) matches.push("po_scope_explanation");
  if (/\b(?:portfolio summary|portfolio synthesis|portfolio overview|scope appears stale|items? appear blocked|priority distribution|status distribution)\b/.test(normalized)) matches.push("po_portfolio_synthesis");
  if (/\b(?:architecture review|review architecture|architectural constraints?|architecture decision)\b/.test(normalized)) matches.push("po_architecture_review");

  const uniqueMatches = Array.from(new Set(matches));
  if (uniqueMatches.length !== 1) {
    return { status: uniqueMatches.length ? "ambiguous" : "unsupported", taskClass: null, scopeIds, reason: uniqueMatches.length ? `Multiple supported task classes matched: ${uniqueMatches.join(", ")}.` : "No conservative deterministic task rule matched." };
  }

  const taskClass = uniqueMatches[0];
  if (taskClass === "po_scope_comparison" && (scopeIds.length < 2 || scopeIds.length > 6)) return { status: "ambiguous", taskClass: null, scopeIds, reason: "Scope comparison requires two to six explicit scope IDs." };
  if ((taskClass === "po_scope_explanation" || taskClass === "po_architecture_review") && scopeIds.length !== 1) return { status: "ambiguous", taskClass: null, scopeIds, reason: `${taskClass} requires one explicit scope ID.` };
  return { status: "supported", taskClass, scopeIds, reason: `Matched deterministic ${taskClass} policy.` };
}
