import { describe, expect, it } from "vitest";

import { addProposedMutation, createWorkingPortfolio, withdrawMutation } from "./working";
import type { CanonicalPortfolio, Confidence, DependencyEdge, PortfolioMutation, ProvenanceClass, ScopeItem } from "./types";

const scopeItem: ScopeItem = {
  id: "TEST-SCOPE-001", title: "Test", type: "Feature", parent: "Governance", priority: "P1", status: "Not started", lane: "Safe lane",
  owner: "Mike", source: "Fixture", problem: "Problem", desiredOutcome: "Outcome", inScope: [], outOfScope: [], acceptanceCriteria: [],
  dependencies: [], risks: [], nextAction: "Next", linksEvidence: [], scores: {}, sourceLocation: { filePath: "fixture", heading: "TEST-SCOPE-001", recordFingerprint: "hash" }, missingFields: [],
};
const canonical: CanonicalPortfolio = { metadata: { sourceFilePath: "fixture", sourceGitSha: "sha", sourceContentHash: "hash", parsedAt: null }, items: [scopeItem], references: [], sequencingEvidence: [], dependencyEdges: [] };

function mutation(overrides: Partial<PortfolioMutation> = {}): PortfolioMutation {
  return {
    mutationId: "mutation-1", scopeId: "TEST-SCOPE-001", fieldPath: "priority", canonicalValue: "P1", proposedValue: "P0",
    rationale: "Test", evidenceRefs: ["fixture"], confidence: "high", provenance: "po_approved_decision", actor: "Mike",
    guardrailImpact: { level: "review", ruleIds: [], rationale: null }, recalculationImpact: { facts: ["priority_distribution"], affectedScopeIds: ["TEST-SCOPE-001"] }, state: "proposed",
    ...overrides,
  };
}

describe("immutable Working Portfolio", () => {
  it("applies a priority proposal without mutating Canonical state", () => {
    const working = createWorkingPortfolio(canonical, [mutation()]);
    expect(working.effectiveItems[0].priority).toBe("P0");
    expect(working.canonical.items[0].priority).toBe("P1");
    expect(canonical.items[0].priority).toBe("P1");
    expect(working.derivedFacts.priorityDistribution).toEqual({ P0: 1 });
  });

  it("withdraws a mutation so it no longer affects effective state", () => {
    const initial = addProposedMutation(createWorkingPortfolio(canonical), mutation());
    const withdrawn = withdrawMutation(initial, "mutation-1");
    expect(withdrawn.effectiveItems[0].priority).toBe("P1");
    expect(withdrawn.ledger[0].mutation.state).toBe("withdrawn");
  });

  it("detects conflicting active mutations to the same field", () => {
    const working = createWorkingPortfolio(canonical, [mutation(), mutation({ mutationId: "mutation-2", proposedValue: "P2" })]);
    expect(working.diagnostics).toContainEqual(expect.objectContaining({ code: "conflicting_mutations", severity: "error" }));
    expect(working.effectiveItems[0].priority).toBe("P1");
  });

  it("rejects unknown scope IDs", () => {
    expect(createWorkingPortfolio(canonical, [mutation({ scopeId: "UNKNOWN-001" })]).diagnostics).toContainEqual(expect.objectContaining({ code: "unresolved_scope_id" }));
  });

  it("rejects canonical value drift", () => {
    expect(createWorkingPortfolio(canonical, [mutation({ canonicalValue: "P2" })]).diagnostics).toContainEqual(expect.objectContaining({ code: "canonical_value_mismatch" }));
  });

  it("rejects unsupported paths and record deletion", () => {
    const diagnostics = createWorkingPortfolio(canonical, [mutation({ fieldPath: "delete", proposedValue: null })]).diagnostics;
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual(expect.arrayContaining(["protected_destructive_operation", "unsupported_field_path"]));
  });

  it("applies evidence-backed score and dependency mutations only to effective state", () => {
    const scoreMutation = mutation({ mutationId: "score", fieldPath: "scores.business_user_value", canonicalValue: null, proposedValue: 5 });
    const dependencyMutation = mutation({
      mutationId: "dependency", fieldPath: "dependencyEdges", canonicalValue: [],
      proposedValue: [{ fromScopeId: "TEST-SCOPE-001", toScopeId: "SECOND-SCOPE-001", relationshipType: "requires", state: "proposed", provenance: "po_approved_decision", evidenceRefs: ["fixture"], confidence: "high" }],
    });
    const second = { ...scopeItem, id: "SECOND-SCOPE-001", title: "Second", sourceLocation: { ...scopeItem.sourceLocation, heading: "SECOND-SCOPE-001" } };
    const expanded = { ...canonical, items: [scopeItem, second] };
    const working = createWorkingPortfolio(expanded, [scoreMutation, dependencyMutation]);
    expect(working.diagnostics).toEqual([]);
    expect(working.effectiveItems[0].scores.business_user_value).toMatchObject({ value: 5, provenance: "po_approved_decision", evidenceRefs: ["fixture"] });
    expect(working.effectiveDependencyEdges).toHaveLength(1);
    expect(working.canonical.items[0].scores).toEqual({});
    expect(working.canonical.dependencyEdges).toEqual([]);
  });

  it("replaces stale score assessment metadata with the current mutation evidence", () => {
    const oldScore = {
      dimension: "business_user_value" as const, value: 3, state: "canonical" as const, provenance: "observed_fact" as const,
      evidenceRefs: ["old-evidence"], rationale: "old rationale", confidence: "low" as const, assessmentVersion: "old-v1",
      assessedAt: "2026-01-01T00:00:00Z", approvalState: "approved" as const, contradictions: ["old contradiction"], uncertainty: ["old uncertainty"],
    };
    const scoredItem = { ...scopeItem, scores: { business_user_value: oldScore } };
    const scoredCanonical = { ...canonical, items: [scoredItem] };
    const current = mutation({
      mutationId: "score-replacement", fieldPath: "scores.business_user_value", canonicalValue: 3, proposedValue: 5,
      evidenceRefs: ["new-evidence"], rationale: "new rationale", provenance: "po_approved_decision", confidence: "high",
    });
    const working = createWorkingPortfolio(scoredCanonical, [current]);
    expect(working.effectiveItems[0].scores.business_user_value).toEqual({
      dimension: "business_user_value", value: 5, state: "proposed", provenance: "po_approved_decision",
      evidenceRefs: ["new-evidence"], rationale: "new rationale", confidence: "high", assessmentVersion: null,
      assessedAt: null, approvalState: "pending", contradictions: [], uncertainty: [],
    });
    expect(working.canonical.items[0].scores.business_user_value).toEqual(oldScore);
    expect(scoredCanonical.items[0].scores.business_user_value).toEqual(oldScore);
  });

  it("rejects invalid candidate dependency graphs and leaves the effective graph unchanged", () => {
    const existing = dependencyEdge("SECOND-SCOPE-001", "TEST-SCOPE-001");
    const second = { ...scopeItem, id: "SECOND-SCOPE-001", title: "Second", sourceLocation: { ...scopeItem.sourceLocation, heading: "SECOND-SCOPE-001" } };
    const expanded = { ...canonical, items: [scopeItem, second], dependencyEdges: [existing] };
    const duplicate = dependencyEdge("TEST-SCOPE-001", "SECOND-SCOPE-001");
    const proposed = mutation({ mutationId: "bad-graph", fieldPath: "dependencyEdges", canonicalValue: [], proposedValue: [duplicate, duplicate] });
    const working = createWorkingPortfolio(expanded, [proposed]);
    expect(working.diagnostics).toContainEqual(expect.objectContaining({ code: "duplicate_dependency_edge" }));
    expect(working.effectiveDependencyEdges).toEqual([existing]);
  });

  it.each([
    ["invalid_dependency_relationship", { relationshipType: "invalid" }],
    ["invalid_provenance", { provenance: "invalid" }],
    ["invalid_confidence", { confidence: "invalid" }],
  ] as const)("rejects runtime dependency vocabulary: %s", (code, edgeOverride) => {
    const second = { ...scopeItem, id: "SECOND-SCOPE-001", title: "Second", sourceLocation: { ...scopeItem.sourceLocation, heading: "SECOND-SCOPE-001" } };
    const expanded = { ...canonical, items: [scopeItem, second] };
    const malformed = { ...dependencyEdge("TEST-SCOPE-001", "SECOND-SCOPE-001"), ...edgeOverride } as unknown as DependencyEdge;
    const proposed = mutation({ fieldPath: "dependencyEdges", canonicalValue: [], proposedValue: [malformed] });
    const working = createWorkingPortfolio(expanded, [proposed]);
    expect(working.diagnostics).toContainEqual(expect.objectContaining({ code }));
    expect(working.effectiveDependencyEdges).toEqual([]);
  });
});

function dependencyEdge(fromScopeId: string, toScopeId: string, overrides: Partial<DependencyEdge> = {}): DependencyEdge {
  return {
    fromScopeId, toScopeId, relationshipType: "requires", state: "proposed", provenance: "observed_fact" as ProvenanceClass,
    evidenceRefs: ["fixture"], confidence: "high" as Confidence, ...overrides,
  };
}
