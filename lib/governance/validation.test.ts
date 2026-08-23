import { describe, expect, it } from "vitest";

import { validatePortfolio } from "./validation";
import type { CanonicalPortfolio, PortfolioScore, ProvenanceClass, Confidence, ScopeItem } from "./types";

function score(overrides: Partial<PortfolioScore> = {}): PortfolioScore {
  return {
    dimension: "business_user_value", value: 3, state: "proposed", provenance: "agent_assessment",
    evidenceRefs: ["fixture"], rationale: "test", confidence: "medium", assessmentVersion: "v1",
    assessedAt: "2026-08-23T00:00:00Z", approvalState: "pending", contradictions: [], uncertainty: [], ...overrides,
  };
}

function portfolio(portfolioScore: PortfolioScore): CanonicalPortfolio {
  const item: ScopeItem = {
    id: "TEST-SCORE-001", title: "Test", type: "Feature", parent: null, priority: "P1", status: "Not started", lane: "Safe lane",
    owner: null, source: null, problem: null, desiredOutcome: null, inScope: [], outOfScope: [], acceptanceCriteria: [], dependencies: [],
    risks: [], nextAction: null, linksEvidence: [], scores: { business_user_value: portfolioScore },
    sourceLocation: { filePath: "fixture", heading: "TEST-SCORE-001", recordFingerprint: "hash" }, missingFields: [],
  };
  return { metadata: { sourceFilePath: "fixture", sourceGitSha: "sha", sourceContentHash: "hash", parsedAt: null }, items: [item], references: [], dependencyEdges: [] };
}

describe("portfolio evidence vocabulary validation", () => {
  it("reports invalid score provenance supplied at runtime", () => {
    const malformed = score({ provenance: "invalid" as ProvenanceClass });
    expect(validatePortfolio(portfolio(malformed))).toContainEqual(expect.objectContaining({ code: "invalid_provenance", fieldPath: "scores.business_user_value" }));
  });

  it("reports invalid score confidence supplied at runtime", () => {
    const malformed = score({ confidence: "invalid" as Confidence });
    expect(validatePortfolio(portfolio(malformed))).toContainEqual(expect.objectContaining({ code: "invalid_confidence", fieldPath: "scores.business_user_value" }));
  });

  it.each(["agent_assessment", "po_approved_decision"] as const)("accepts valid %s provenance", (provenance) => {
    expect(validatePortfolio(portfolio(score({ provenance })))).toEqual([]);
  });

  it("accepts explicit not_scored state", () => {
    expect(validatePortfolio(portfolio(score({ value: null, state: "not_scored", confidence: "not_scored" })))).toEqual([]);
  });
});
