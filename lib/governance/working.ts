import { calculateWsjf, isScoreDimension, isValidScoreValue } from "./scoring";
import { detectDependencyCycles, directDependencies, directDependents } from "./dependencies";
import { supportedScopeStatuses } from "./validation";
import { confidenceLevels, provenanceClasses, scopePriorities, type CanonicalPortfolio, type DependencyEdge, type PortfolioDerivedFacts, type PortfolioMutation, type ScopeItem, type ValidationDiagnostic, type WorkingPortfolio } from "./types";

const scalarFields = new Set(["title", "type", "parent", "priority", "status", "lane", "owner", "source", "problem", "desiredOutcome", "nextAction"]);
const listFields = new Set(["inScope", "outOfScope", "acceptanceCriteria", "dependencies", "risks", "linksEvidence"]);

export function validateMutation(portfolio: CanonicalPortfolio, mutation: PortfolioMutation, edges: DependencyEdge[] = portfolio.dependencyEdges): ValidationDiagnostic[] {
  const diagnostics: ValidationDiagnostic[] = [];
  const item = portfolio.items.find((candidate) => candidate.id === mutation.scopeId);
  if (!item) return [{ code: "unresolved_scope_id", severity: "error", scopeId: mutation.scopeId, message: `Unknown scope ID: ${mutation.scopeId}.` }];
  if (!confidenceLevels.includes(mutation.confidence) || !provenanceClasses.includes(mutation.provenance)) diagnostics.push({ code: "invalid_mutation_evidence", severity: "error", scopeId: mutation.scopeId, message: "Mutation confidence or provenance is invalid." });
  if (mutation.fieldPath === "record" || mutation.fieldPath === "delete" || mutation.proposedValue === undefined) diagnostics.push({ code: "protected_destructive_operation", severity: "error", scopeId: mutation.scopeId, fieldPath: mutation.fieldPath, message: "Scope record deletion is not supported." });
  if (!isSupportedPath(mutation.fieldPath)) diagnostics.push({ code: "unsupported_field_path", severity: "error", scopeId: mutation.scopeId, fieldPath: mutation.fieldPath, message: `Unsupported mutation path: ${mutation.fieldPath}.` });
  const current = mutation.fieldPath === "dependencyEdges" ? edges.filter((edge) => edge.fromScopeId === mutation.scopeId) : readPath(item, mutation.fieldPath);
  if (!deepEqual(current, mutation.canonicalValue)) diagnostics.push({ code: "canonical_value_mismatch", severity: "error", scopeId: mutation.scopeId, fieldPath: mutation.fieldPath, message: "Mutation canonical value does not match the current snapshot." });
  if (mutation.fieldPath === "priority" && !scopePriorities.includes(mutation.proposedValue as never)) diagnostics.push({ code: "illegal_priority", severity: "error", scopeId: mutation.scopeId, fieldPath: mutation.fieldPath, message: `Illegal priority: ${String(mutation.proposedValue)}.` });
  if (mutation.fieldPath === "status" && !supportedScopeStatuses.includes(mutation.proposedValue as never)) diagnostics.push({ code: "invalid_status", severity: "error", scopeId: mutation.scopeId, fieldPath: mutation.fieldPath, message: `Invalid status: ${String(mutation.proposedValue)}.` });
  if (mutation.fieldPath.startsWith("scores.") && mutation.proposedValue !== null && !isValidScoreValue(mutation.proposedValue)) diagnostics.push({ code: "malformed_score", severity: "error", scopeId: mutation.scopeId, fieldPath: mutation.fieldPath, message: "Score must be an integer from 1 to 5 or explicit null." });
  if (mutation.fieldPath === "dependencyEdges") {
    if (!Array.isArray(mutation.proposedValue)) diagnostics.push({ code: "malformed_dependency_edges", severity: "error", scopeId: mutation.scopeId, message: "dependencyEdges must be an array." });
    const proposed = Array.isArray(mutation.proposedValue) ? mutation.proposedValue as DependencyEdge[] : [];
    for (const edge of proposed) {
      if (edge.fromScopeId !== mutation.scopeId) diagnostics.push({ code: "malformed_dependency_source", severity: "error", scopeId: mutation.scopeId, message: `Dependency source must be ${mutation.scopeId}.` });
      if (!portfolio.items.some((candidate) => candidate.id === edge.toScopeId)) diagnostics.push({ code: "unknown_dependency_target", severity: "error", scopeId: mutation.scopeId, message: `Unknown dependency target: ${edge.toScopeId}.` });
      if (edge.fromScopeId === edge.toScopeId) diagnostics.push({ code: "self_dependency", severity: "error", scopeId: mutation.scopeId, message: "Self dependency is not allowed." });
    }
  }
  return diagnostics;
}

export function createWorkingPortfolio(canonical: CanonicalPortfolio, mutations: PortfolioMutation[] = [], edges: DependencyEdge[] = canonical.dependencyEdges): WorkingPortfolio {
  const canonicalCopy = clone(canonical);
  const diagnostics: ValidationDiagnostic[] = [];
  const active = mutations.filter((mutation) => mutation.state === "proposed");
  const conflicts = new Map<string, number>();
  for (const mutation of active) {
    diagnostics.push(...validateMutation(canonicalCopy, mutation, edges));
    const key = `${mutation.scopeId}:${mutation.fieldPath}`;
    conflicts.set(key, (conflicts.get(key) ?? 0) + 1);
  }
  for (const [key, count] of Array.from(conflicts.entries())) if (count > 1) diagnostics.push({ code: "conflicting_mutations", severity: "error", message: `${count} active mutations target ${key}.` });

  const effectiveItems = clone(canonicalCopy.items);
  let effectiveDependencyEdges = clone(edges);
  if (!diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    for (const mutation of active) {
      if (mutation.fieldPath === "dependencyEdges") {
        effectiveDependencyEdges = effectiveDependencyEdges.filter((edge) => edge.fromScopeId !== mutation.scopeId).concat(clone(mutation.proposedValue as DependencyEdge[]));
      } else applyMutation(effectiveItems, mutation);
    }
  }
  return {
    canonical: canonicalCopy,
    ledger: mutations.map((mutation, sequence) => ({ mutation: clone(mutation), sequence })),
    effectiveItems,
    effectiveDependencyEdges,
    diagnostics,
    derivedFacts: deriveFacts(effectiveItems, effectiveDependencyEdges),
  };
}

export function addProposedMutation(working: WorkingPortfolio, mutation: PortfolioMutation, edges: DependencyEdge[] = working.canonical.dependencyEdges) {
  return createWorkingPortfolio(working.canonical, [...working.ledger.map((entry) => entry.mutation), mutation], edges);
}

export function withdrawMutation(working: WorkingPortfolio, mutationId: string, edges: DependencyEdge[] = working.canonical.dependencyEdges) {
  const mutations = working.ledger.map(({ mutation }) => mutation.mutationId === mutationId ? { ...mutation, state: "withdrawn" as const } : mutation);
  return createWorkingPortfolio(working.canonical, mutations, edges);
}

export function resetWorkingPortfolio(working: WorkingPortfolio, edges: DependencyEdge[] = working.canonical.dependencyEdges) {
  return createWorkingPortfolio(working.canonical, [], edges);
}

function deriveFacts(items: ScopeItem[], edges: DependencyEdge[]): PortfolioDerivedFacts {
  const priorityDistribution = countBy(items, (item) => item.priority ?? "missing");
  const statusDistribution = countBy(items, (item) => item.status ?? "missing");
  const wsjf = Object.fromEntries(items.map((item) => [item.id, calculateWsjf(item.scores)]));
  const dependencyCounts = Object.fromEntries(items.map((item) => [item.id, { dependencies: directDependencies(item.id, edges).length, dependents: directDependents(item.id, edges).length }]));
  return { priorityDistribution, statusDistribution, wsjf, dependencyCounts, dependencyCycles: detectDependencyCycles(edges) };
}

function applyMutation(items: ScopeItem[], mutation: PortfolioMutation) {
  const item = items.find((candidate) => candidate.id === mutation.scopeId)!;
  if (scalarFields.has(mutation.fieldPath) || listFields.has(mutation.fieldPath)) (item as unknown as Record<string, unknown>)[mutation.fieldPath] = clone(mutation.proposedValue);
  else if (mutation.fieldPath.startsWith("scores.")) {
    const dimension = mutation.fieldPath.slice("scores.".length);
    if (isScoreDimension(dimension)) {
      const existing = item.scores[dimension];
      item.scores[dimension] = existing ? { ...existing, value: mutation.proposedValue as number | null } : {
        dimension,
        value: mutation.proposedValue as number | null,
        state: mutation.proposedValue === null ? "not_scored" : "proposed",
        provenance: mutation.provenance,
        evidenceRefs: clone(mutation.evidenceRefs),
        rationale: mutation.rationale,
        confidence: mutation.proposedValue === null ? "not_scored" : mutation.confidence,
        assessmentVersion: null,
        assessedAt: null,
        approvalState: "pending",
        contradictions: [],
        uncertainty: [],
      };
    }
  }
}

function isSupportedPath(path: string) {
  if (scalarFields.has(path) || listFields.has(path) || path === "dependencyEdges") return true;
  return path.startsWith("scores.") && isScoreDimension(path.slice("scores.".length));
}

function readPath(item: ScopeItem, path: string): unknown {
  if (scalarFields.has(path) || listFields.has(path)) return (item as unknown as Record<string, unknown>)[path];
  if (path.startsWith("scores.")) return item.scores[path.slice("scores.".length) as keyof typeof item.scores]?.value ?? null;
  return undefined;
}

function countBy(items: ScopeItem[], key: (item: ScopeItem) => string) {
  const result: Record<string, number> = {};
  for (const item of items) result[key(item)] = (result[key(item)] ?? 0) + 1;
  return result;
}

function deepEqual(left: unknown, right: unknown) { return JSON.stringify(left) === JSON.stringify(right); }
function clone<T>(value: T): T { return structuredClone(value); }
