import { describe, expect, it } from "vitest";
import { assertPoAgentExecutionAllowed, DEFAULT_PO_AGENT_MODEL, getPoAgentConfiguration, type PoAgentResponse } from "../governance/agent/orchestrator";
import { buildUsageMetadata } from "../governance/agent/usageMetadata";

describe("MODEL-ROUTING-001 MR-A Phase B compatibility", () => {
  it("preserves Phase B model selection, response shape, usage behavior, and fail-closed deployment gate", () => {
    expect(DEFAULT_PO_AGENT_MODEL).toBe("gpt-5.6-sol");
    expect(getPoAgentConfiguration({ OPENAI_API_KEY: "fixture" })).toMatchObject({ configured: true, model: "gpt-5.6-sol" });
    expect(() => assertPoAgentExecutionAllowed({ VERCEL_ENV: "production", OPENAI_API_KEY: "fixture" })).toThrow("enablement is not explicit");
    const response = {
      answer: "fixture", readOnly: true, canonicalSource: "docs/SCOPE.md", sourceRevision: "fixture", diagnosticCount: 0,
      usage: buildUsageMetadata("gpt-5.6-sol", { inputTokens: 27_705, outputTokens: 270, totalTokens: 27_975 }),
    } satisfies PoAgentResponse;
    expect(response.usage.estimatedCostUsd).toBeCloseTo(0.146625, 10);
  });
});
