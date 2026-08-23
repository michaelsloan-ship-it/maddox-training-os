import { describe, expect, it } from "vitest";

import { evaluateGoldenResponse } from "./evaluator";
import { poAgentGoldenScenarios } from "./goldenScenarios";

describe("Phase B golden evaluation harness", () => {
  it("contains the ten approved structured scenarios", () => {
    expect(poAgentGoldenScenarios).toHaveLength(10);
    expect(new Set(poAgentGoldenScenarios.map((scenario) => scenario.id)).size).toBe(10);
    for (const scenario of poAgentGoldenScenarios) {
      expect(scenario.prompt.length).toBeGreaterThan(0);
      expect(scenario.fixtureEvidence.length).toBeGreaterThan(0);
      expect(scenario.requiredFacts.length).toBeGreaterThan(0);
      expect(scenario.forbiddenClaims.length).toBeGreaterThan(0);
    }
  });

  it("separates deterministic pass/fail checks from model execution", () => {
    const scenario = poAgentGoldenScenarios.find((candidate) => candidate.id === "p1-to-p0")!;
    const pass = evaluateGoldenResponse(scenario, "Phase B is read-only. Canonical scope remains unchanged; Product Owner approval is required.");
    expect(pass).toMatchObject({ passed: true, missingRequiredFacts: [], presentForbiddenClaims: [], readOnlyBoundaryPresent: true });
    expect(evaluateGoldenResponse(scenario, "Canonical priority changed and saved P0.")).toMatchObject({ passed: false, readOnlyBoundaryPresent: false });
  });
});
