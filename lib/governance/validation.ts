import { confidenceLevels, provenanceClasses, scopePriorities, type CanonicalPortfolio, type DependencyEdge, type PortfolioScore, type ValidationDiagnostic } from "./types";
import { validateDependencyEdges } from "./dependencies";
import { validatePortfolioScore } from "./scoring";

export const supportedScopeStatuses = [
  "Scope review required", "Not started", "In progress", "Blocked", "Completed", "Deferred", "Historical",
  "Completed locally", "CI verified / Production pending", "Production runtime verified / Preview runtime pending",
  "Reopened / product QA found incomplete rendering-path coverage",
] as const;

export function validatePortfolio(portfolio: CanonicalPortfolio, edges: DependencyEdge[] = []): ValidationDiagnostic[] {
  const diagnostics: ValidationDiagnostic[] = [];
  const counts = new Map<string, number>();
  for (const item of portfolio.items) counts.set(item.id, (counts.get(item.id) ?? 0) + 1);
  for (const [id, count] of Array.from(counts.entries())) if (count > 1) diagnostics.push({ code: "duplicate_scope_id", severity: "error", scopeId: id, message: `${id} appears in ${count} detailed records.` });

  const ids = new Set(portfolio.items.map((item) => item.id));
  for (const reference of portfolio.references) if (!ids.has(reference.scopeId)) diagnostics.push({ code: "unknown_scope_reference", severity: "warning", scopeId: reference.scopeId, message: `${reference.source} references ${reference.scopeId}, which has no parsed detailed record.` });
  for (const item of portfolio.items) {
    if (item.priority !== null && !scopePriorities.includes(item.priority as never)) diagnostics.push({ code: "invalid_priority", severity: "error", scopeId: item.id, fieldPath: "priority", message: `Invalid priority: ${item.priority}.` });
    if (item.status !== null && !supportedScopeStatuses.includes(item.status as never)) diagnostics.push({ code: "invalid_status", severity: "error", scopeId: item.id, fieldPath: "status", message: `Invalid status: ${item.status}.` });
    for (const score of Object.values(item.scores)) diagnostics.push(...scoreDiagnostics(item.id, score));
  }
  diagnostics.push(...validateDependencyEdges(portfolio, edges));
  return diagnostics;
}

export function validateEvidenceVocabulary(provenance: string, confidence: string): ValidationDiagnostic[] {
  const diagnostics: ValidationDiagnostic[] = [];
  if (!provenanceClasses.includes(provenance as never)) diagnostics.push({ code: "invalid_provenance", severity: "error", message: `Invalid provenance: ${provenance}.` });
  if (!confidenceLevels.includes(confidence as never)) diagnostics.push({ code: "invalid_confidence", severity: "error", message: `Invalid confidence: ${confidence}.` });
  return diagnostics;
}

function scoreDiagnostics(scopeId: string, score: PortfolioScore): ValidationDiagnostic[] {
  return validatePortfolioScore(score).map((code) => ({ code, severity: "error", scopeId, fieldPath: `scores.${score.dimension}`, message: `Invalid ${score.dimension} score (${code}).` }));
}
