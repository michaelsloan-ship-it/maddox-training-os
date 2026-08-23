import { scoreDimensions, type PortfolioScore, type ScoreDimension, type WsjfInputName, type WsjfResult } from "./types";

export function isScoreDimension(value: string): value is ScoreDimension {
  return scoreDimensions.includes(value as ScoreDimension);
}
export function isValidScoreValue(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === "number" && value >= 1 && value <= 5;
}

export function validatePortfolioScore(score: PortfolioScore): string[] {
  const errors: string[] = [];
  if (!isScoreDimension(score.dimension)) errors.push("invalid_score_dimension");
  if (score.value !== null && !isValidScoreValue(score.value)) errors.push("invalid_score_value");
  if (score.state === "not_scored" && score.value !== null) errors.push("not_scored_has_value");
  if (score.state !== "not_scored" && score.value === null) errors.push("scored_value_missing");
  return errors;
}

export function calculateWsjf(scores: Partial<Record<ScoreDimension, PortfolioScore>>): WsjfResult {
  const required: WsjfInputName[] = [
    "business_user_value",
    "time_criticality",
    "risk_reduction_opportunity_enablement",
    "job_size_effort",
  ];
  const missingInputs = required.filter((dimension) => !scores[dimension] || scores[dimension]?.value === null);
  const invalidInputs = required.filter((dimension) => {
    const value = scores[dimension]?.value;
    return value !== undefined && value !== null && !isValidScoreValue(value);
  });
  if (missingInputs.length || invalidInputs.length) return { available: false, value: null, missingInputs, invalidInputs };

  const inputs = Object.fromEntries(required.map((dimension) => [dimension, scores[dimension]!.value!])) as Record<WsjfInputName, number>;
  if (inputs.job_size_effort === 0) return { available: false, value: null, missingInputs: [], invalidInputs: ["job_size_effort"] };
  return {
    available: true,
    value: (inputs.business_user_value + inputs.time_criticality + inputs.risk_reduction_opportunity_enablement) / inputs.job_size_effort,
    inputs,
  };
}
