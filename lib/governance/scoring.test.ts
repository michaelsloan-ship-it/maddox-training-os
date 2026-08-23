import { describe, expect, it } from "vitest";

import { calculateWsjf, isValidScoreValue } from "./scoring";
import type { PortfolioScore, ScoreDimension } from "./types";

function score(dimension: ScoreDimension, value: number | null): PortfolioScore {
  return {
    dimension, value, state: value === null ? "not_scored" : "proposed", provenance: "agent_assessment",
    evidenceRefs: ["fixture"], rationale: "test", confidence: value === null ? "not_scored" : "medium",
    assessmentVersion: "v1", assessedAt: "2026-08-23T00:00:00Z", approvalState: "pending", contradictions: [], uncertainty: [],
  };
}

describe("deterministic scoring", () => {
  it("calculates WSJF only from complete valid supplied inputs", () => {
    const result = calculateWsjf({
      business_user_value: score("business_user_value", 5),
      time_criticality: score("time_criticality", 4),
      risk_reduction_opportunity_enablement: score("risk_reduction_opportunity_enablement", 3),
      job_size_effort: score("job_size_effort", 2),
    });
    expect(result).toMatchObject({ available: true, value: 6 });
  });

  it.each(["business_user_value", "time_criticality", "risk_reduction_opportunity_enablement", "job_size_effort"] as const)("reports missing %s", (missing) => {
    const scores = {
      business_user_value: score("business_user_value", 5),
      time_criticality: score("time_criticality", 4),
      risk_reduction_opportunity_enablement: score("risk_reduction_opportunity_enablement", 3),
      job_size_effort: score("job_size_effort", 2),
    };
    delete (scores as Partial<typeof scores>)[missing];
    expect(calculateWsjf(scores)).toMatchObject({ available: false, missingInputs: [missing] });
  });

  it("rejects invalid 1-5 values and zero Job Size without defaults", () => {
    expect(isValidScoreValue(0)).toBe(false);
    expect(isValidScoreValue(6)).toBe(false);
    const result = calculateWsjf({
      business_user_value: score("business_user_value", 5),
      time_criticality: score("time_criticality", 4),
      risk_reduction_opportunity_enablement: score("risk_reduction_opportunity_enablement", 3),
      job_size_effort: score("job_size_effort", 0),
    });
    expect(result).toMatchObject({ available: false, invalidInputs: ["job_size_effort"] });
  });

  it("keeps agent assessment and not_scored provenance states explicit", () => {
    expect(score("business_user_value", 4)).toMatchObject({ provenance: "agent_assessment", state: "proposed" });
    expect(score("business_user_value", null)).toMatchObject({ value: null, state: "not_scored", confidence: "not_scored" });
    expect(score("business_user_value", null).provenance).not.toBe("observed_fact");
  });
});
