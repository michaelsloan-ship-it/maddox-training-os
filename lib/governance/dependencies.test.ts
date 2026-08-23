import { describe, expect, it } from "vitest";

import { detectDependencyCycles, directDependencies, directDependents, transitiveDependencies, validateDependencyEdges } from "./dependencies";
import type { CanonicalPortfolio, DependencyEdge, ScopeItem } from "./types";

const item = (id: string): ScopeItem => ({
  id, title: id, type: "Feature", parent: null, priority: "P1", status: "Not started", lane: "Safe lane", owner: null,
  source: null, problem: null, desiredOutcome: null, inScope: [], outOfScope: [], acceptanceCriteria: [], dependencies: [], risks: [],
  nextAction: null, linksEvidence: [], scores: {}, sourceLocation: { filePath: "fixture", heading: id, recordFingerprint: id }, missingFields: [],
});
const portfolio: CanonicalPortfolio = { metadata: { sourceFilePath: "fixture", sourceGitSha: "sha", sourceContentHash: "hash", parsedAt: null }, items: [item("A-001"), item("B-001"), item("C-001")], references: [], dependencyEdges: [] };
const edge = (fromScopeId: string, toScopeId: string, relationshipType: DependencyEdge["relationshipType"] = "requires"): DependencyEdge => ({
  fromScopeId, toScopeId, relationshipType, state: "canonical", provenance: "observed_fact", evidenceRefs: ["fixture"], confidence: "high",
});

describe("dependency graph", () => {
  it("resolves a requires chain and transitive dependencies", () => {
    const edges = [edge("A-001", "B-001"), edge("B-001", "C-001")];
    expect(directDependencies("A-001", edges)).toEqual(["B-001"]);
    expect(directDependents("B-001", edges)).toEqual(["A-001"]);
    expect(transitiveDependencies("A-001", edges)).toEqual(["B-001", "C-001"]);
  });

  it("detects cycles", () => {
    expect(detectDependencyCycles([edge("A-001", "B-001"), edge("B-001", "A-001")])).toHaveLength(1);
  });

  it("reports self dependencies, unknown targets, and duplicate edges", () => {
    const diagnostics = validateDependencyEdges(portfolio, [edge("A-001", "A-001"), edge("A-001", "MISSING-001"), edge("A-001", "B-001"), edge("A-001", "B-001")]);
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual(expect.arrayContaining(["self_dependency", "unknown_dependency_target", "duplicate_dependency_edge"]));
  });

  it("does not use relates_to for sequencing", () => {
    expect(directDependencies("A-001", [edge("A-001", "B-001", "relates_to")])).toEqual([]);
  });

  it("normalizes inverse blocking and requirement relationships", () => {
    expect(directDependencies("A-001", [edge("A-001", "B-001", "blocked_by")])).toEqual(["B-001"]);
    expect(directDependencies("B-001", [edge("A-001", "B-001", "blocks")])).toEqual(["A-001"]);
    expect(directDependencies("B-001", [edge("A-001", "B-001", "required_by")])).toEqual(["A-001"]);
  });
});
