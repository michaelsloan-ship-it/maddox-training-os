import type { PoAgentGoldenScenario } from "./goldenScenarios";

export interface DeterministicEvalResult {
  scenarioId: string;
  passed: boolean;
  missingRequiredFacts: string[];
  presentForbiddenClaims: string[];
  readOnlyBoundaryPresent: boolean;
}

export function evaluateGoldenResponse(scenario: PoAgentGoldenScenario, response: string): DeterministicEvalResult {
  const normalized = response.toLowerCase();
  const missingRequiredFacts = scenario.requiredFacts.filter((fact) => !normalized.includes(fact.toLowerCase()));
  const presentForbiddenClaims = scenario.forbiddenClaims.filter((claim) => normalized.includes(claim.toLowerCase()));
  const readOnlyBoundaryPresent = !scenario.expectedBehavior.includes("read_only") || /read-only|canonical (?:scope )?(?:remains|is) unchanged|cannot (?:write|change|persist)/i.test(response);
  return { scenarioId: scenario.id, passed: !missingRequiredFacts.length && !presentForbiddenClaims.length && readOnlyBoundaryPresent, missingRequiredFacts, presentForbiddenClaims, readOnlyBoundaryPresent };
}
