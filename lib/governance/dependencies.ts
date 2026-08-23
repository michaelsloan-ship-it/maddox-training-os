import { confidenceLevels, dependencyRelationshipTypes, provenanceClasses, type CanonicalPortfolio, type DependencyEdge, type ScopePriority, type ValidationDiagnostic } from "./types";

const sequencingRelationships = new Set(["blocks", "blocked_by", "requires", "required_by"]);

export function validateDependencyEdges(portfolio: CanonicalPortfolio, edges: DependencyEdge[]): ValidationDiagnostic[] {
  const diagnostics: ValidationDiagnostic[] = [];
  const ids = new Set(portfolio.items.map((item) => item.id));
  const seen = new Set<string>();
  for (const edge of edges) {
    if (!dependencyRelationshipTypes.includes(edge.relationshipType)) diagnostics.push({ code: "invalid_dependency_relationship", severity: "error", scopeId: edge.fromScopeId, message: `Invalid dependency relationship: ${String(edge.relationshipType)}.` });
    if (!provenanceClasses.includes(edge.provenance)) diagnostics.push({ code: "invalid_provenance", severity: "error", scopeId: edge.fromScopeId, message: `Invalid dependency provenance: ${String(edge.provenance)}.` });
    if (!confidenceLevels.includes(edge.confidence)) diagnostics.push({ code: "invalid_confidence", severity: "error", scopeId: edge.fromScopeId, message: `Invalid dependency confidence: ${String(edge.confidence)}.` });
    if (!ids.has(edge.fromScopeId) || !ids.has(edge.toScopeId)) diagnostics.push({ code: "unknown_dependency_target", severity: "error", scopeId: edge.fromScopeId, message: `Dependency ${edge.fromScopeId} -> ${edge.toScopeId} references an unknown scope ID.` });
    if (edge.fromScopeId === edge.toScopeId) diagnostics.push({ code: "self_dependency", severity: "error", scopeId: edge.fromScopeId, message: `${edge.fromScopeId} cannot depend on itself.` });
    const key = `${edge.fromScopeId}:${edge.toScopeId}:${edge.relationshipType}`;
    if (seen.has(key)) diagnostics.push({ code: "duplicate_dependency_edge", severity: "error", scopeId: edge.fromScopeId, message: `Duplicate dependency edge: ${key}.` });
    seen.add(key);
  }
  return diagnostics;
}

export function directDependencies(scopeId: string, edges: DependencyEdge[]) {
  return neighbors(scopeId, edges, "dependencies");
}

export function directDependents(scopeId: string, edges: DependencyEdge[]) {
  return neighbors(scopeId, edges, "dependents");
}

export function transitiveDependencies(scopeId: string, edges: DependencyEdge[]) {
  return traverse(scopeId, edges, "dependencies");
}

export function transitiveDependents(scopeId: string, edges: DependencyEdge[]) {
  return traverse(scopeId, edges, "dependents");
}

export function detectDependencyCycles(edges: DependencyEdge[]) {
  const graph = adjacency(edges);
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const active = new Set<string>();
  const path: string[] = [];
  const seenCycles = new Set<string>();

  const visit = (node: string) => {
    if (active.has(node)) {
      const cycle = [...path.slice(path.indexOf(node)), node];
      const key = canonicalCycleKey(cycle);
      if (!seenCycles.has(key)) { seenCycles.add(key); cycles.push(cycle); }
      return;
    }
    if (visited.has(node)) return;
    visited.add(node);
    active.add(node);
    path.push(node);
    for (const next of Array.from(graph.get(node) ?? [])) visit(next);
    path.pop();
    active.delete(node);
  };
  for (const node of Array.from(graph.keys())) visit(node);
  return cycles;
}

export function foundationCandidates(portfolio: CanonicalPortfolio, edges: DependencyEdge[]) {
  return portfolio.items.map((item) => item.id).filter((id) => directDependencies(id, edges).length === 0 && directDependents(id, edges).length > 0).sort();
}

export function countTransitivelyBlockedHighPriority(scopeId: string, portfolio: CanonicalPortfolio, edges: DependencyEdge[]) {
  const high = new Set<ScopePriority>(["P0", "P1"]);
  const items = new Map(portfolio.items.map((item) => [item.id, item]));
  return transitiveDependents(scopeId, edges).filter((id) => {
    const priority = items.get(id)?.priority;
    return priority ? high.has(priority as ScopePriority) : false;
  }).length;
}

function neighbors(scopeId: string, edges: DependencyEdge[], direction: "dependencies" | "dependents") {
  const values = new Set<string>();
  for (const edge of normalizedSequencingEdges(edges)) {
    if (direction === "dependencies" && edge.from === scopeId) values.add(edge.to);
    if (direction === "dependents" && edge.to === scopeId) values.add(edge.from);
  }
  return Array.from(values).sort();
}

function traverse(scopeId: string, edges: DependencyEdge[], direction: "dependencies" | "dependents") {
  const result = new Set<string>();
  const pending = [...neighbors(scopeId, edges, direction)];
  while (pending.length) {
    const next = pending.shift()!;
    if (next === scopeId || result.has(next)) continue;
    result.add(next);
    pending.push(...neighbors(next, edges, direction));
  }
  return Array.from(result).sort();
}

function normalizedSequencingEdges(edges: DependencyEdge[]) {
  return edges.filter((edge) => sequencingRelationships.has(edge.relationshipType)).map((edge) => {
    if (edge.relationshipType === "required_by") return { from: edge.toScopeId, to: edge.fromScopeId };
    if (edge.relationshipType === "blocks") return { from: edge.toScopeId, to: edge.fromScopeId };
    return { from: edge.fromScopeId, to: edge.toScopeId };
  });
}

function adjacency(edges: DependencyEdge[]) {
  const result = new Map<string, Set<string>>();
  for (const { from, to } of normalizedSequencingEdges(edges)) {
    if (!result.has(from)) result.set(from, new Set());
    if (!result.has(to)) result.set(to, new Set());
    result.get(from)!.add(to);
  }
  return result;
}

function canonicalCycleKey(cycle: string[]) {
  const nodes = cycle.slice(0, -1);
  return [...nodes].sort().join("|");
}
