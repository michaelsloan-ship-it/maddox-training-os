import { beforeAll, describe, expect, it, vi } from "vitest";

import { loadCanonicalPortfolio, type LoadedCanonicalPortfolio } from "../server/portfolioLoader";
import { DEFAULT_PO_AGENT_MODEL, runReadOnlyPoAgentWithRuntime } from "./orchestrator";

let loaded: LoadedCanonicalPortfolio;
beforeAll(async () => { loaded = await loadCanonicalPortfolio({ sourceRevision: "fixture-sha" }); });

const usage = { requests: 2, inputTokens: 27_705, outputTokens: 270, totalTokens: 27_975, requestUsageEntries: [{}, {}] };

describe("PO Agent MR-B context modes", () => {
  it("keeps legacy as default and preserves the Sol path", async () => {
    const calls: Array<{ input: string; toolCount: number }> = [];
    const response = await execute({}, calls);
    expect(DEFAULT_PO_AGENT_MODEL).toBe("gpt-5.6-sol");
    expect(calls).toHaveLength(1);
    expect(calls[0].input).toBe("What should we work on next?");
    expect(calls[0].toolCount).toBeGreaterThan(0);
    expect(response.contextTelemetry).toMatchObject({ configuredMode: "legacy", mode: "legacy", baselineInputTokens: 27_705, modelRequestCount: 2 });
  });

  it("shadow mode leaves model input/call count unchanged while emitting packet telemetry", async () => {
    const legacyCalls: Array<{ input: string; toolCount: number }> = [];
    const shadowCalls: Array<{ input: string; toolCount: number }> = [];
    await execute({}, legacyCalls);
    const response = await execute({ PO_AGENT_CONTEXT_MODE: "shadow" }, shadowCalls);
    expect(shadowCalls).toHaveLength(legacyCalls.length);
    expect(shadowCalls[0]).toEqual(legacyCalls[0]);
    expect(response.contextTelemetry).toMatchObject({ configuredMode: "shadow", mode: "shadow", taskClass: "po_next_work_explanation", classificationStatus: "supported", mandatoryEvidenceRetained: true });
    expect(response.contextTelemetry?.packedEstimatedTokens).toBeGreaterThan(0);
  });

  it("packed mode supplies bounded evidence exactly once and removes unbounded tools", async () => {
    const calls: Array<{ input: string; toolCount: number }> = [];
    const response = await execute({ PO_AGENT_CONTEXT_MODE: "packed" }, calls);
    expect(calls).toHaveLength(1);
    expect(calls[0].toolCount).toBe(0);
    expect(calls[0].input.match(/EvidencePacket \(appears once\)/g)).toHaveLength(1);
    expect(calls[0].input).toContain("EvidencePacket is authoritative for this request");
    expect(calls[0].input).toContain("Omitted or unsupported evidence must be reported as insufficient, never invented");
    expect(calls[0].input).not.toContain('"excludedCandidates"');
    expect(response.contextTelemetry).toMatchObject({ configuredMode: "packed", mode: "packed", fallbackReason: null, baselineInputTokens: null, toolCallCount: 0 });
  });

  it("requires explicit packed enablement outside local development", async () => {
    const preview = await execute({ VERCEL_ENV: "preview", PO_AGENT_ENABLED: "true", PO_AGENT_CONTEXT_MODE: "packed" }, []);
    const production = await execute({ VERCEL_ENV: "production", PO_AGENT_ENABLED: "true", PO_AGENT_CONTEXT_MODE: "packed" }, []);
    expect(preview.contextTelemetry).toMatchObject({ configuredMode: "packed", mode: "legacy", fallbackReason: "packed_not_enabled_for_environment" });
    expect(production.contextTelemetry).toMatchObject({ configuredMode: "packed", mode: "legacy", fallbackReason: "packed_not_enabled_for_environment" });
  });

  it.each(["preview", "production"] as const)("allows explicitly enabled packed mode in %s", async (vercelEnvironment) => {
    const response = await execute({ VERCEL_ENV: vercelEnvironment, PO_AGENT_ENABLED: "true", PO_AGENT_CONTEXT_MODE: "packed", PO_AGENT_PACKED_ENABLED: "true" }, []);
    expect(response.contextTelemetry).toMatchObject({ configuredMode: "packed", mode: "packed", fallbackReason: null });
  });

  it("treats an invalid context mode as safe legacy behavior", async () => {
    const calls: Array<{ input: string; toolCount: number }> = [];
    const response = await execute({ PO_AGENT_CONTEXT_MODE: "invented" }, calls);
    expect(response.contextTelemetry).toMatchObject({ configuredMode: "legacy", mode: "legacy" });
    expect(calls[0]).toMatchObject({ input: "What should we work on next?" });
    expect(calls[0].toolCount).toBeGreaterThan(0);
  });

  it("falls back explicitly for unsupported tasks and rejected packets", async () => {
    const unsupported = await execute({ PO_AGENT_CONTEXT_MODE: "packed" }, [], "How are things?");
    expect(unsupported.contextTelemetry).toMatchObject({ configuredMode: "packed", mode: "legacy", classificationStatus: "unsupported", fallbackReason: expect.stringContaining("fell back") });
    const rejected = await execute({ PO_AGENT_CONTEXT_MODE: "packed", PO_CONTEXT_NEXT_WORK_EXPLANATION_MAX_INPUT_TOKENS: "1" }, []);
    expect(rejected.contextTelemetry).toMatchObject({ configuredMode: "packed", mode: "legacy", budgetStatus: "REJECTED", fallbackReason: expect.stringContaining("fell back") });
  });

  it("keeps required response fields and usage compatible", async () => {
    const response = await execute({ PO_AGENT_CONTEXT_MODE: "shadow" }, []);
    expect(response).toMatchObject({ answer: "Agent assessment.", readOnly: true, canonicalSource: "docs/SCOPE.md", sourceRevision: "fixture-sha", diagnosticCount: expect.any(Number), usage: { model: "gpt-5.6-sol", inputTokens: 27_705, outputTokens: 270, totalTokens: 27_975 } });
  });

  it("captures per-request accounting only when the SDK supplies complete entries", async () => {
    const response = await execute({ PO_AGENT_CONTEXT_MODE: "shadow" }, [], "What should we work on next?", { ...usage, requestUsageEntries: [{ inputTokens: 10_000, outputTokens: 100 }, { inputTokens: 17_705, outputTokens: 170 }] });
    expect(response.contextTelemetry).toMatchObject({ aggregateRunInputTokens: 27_705, aggregateRunOutputTokens: 270, modelRequestCount: 2, perRequestUsage: [{ inputTokens: 10_000, outputTokens: 100 }, { inputTokens: 17_705, outputTokens: 170 }] });
  });
});

async function execute(extraEnvironment: Record<string, string | undefined>, calls: Array<{ input: string; toolCount: number }>, question = "What should we work on next?", usageOverride = usage) {
  const runner = vi.fn(async (agent: unknown, input: string) => {
    const toolCount = (agent as { tools: unknown[] }).tools.length;
    calls.push({ input, toolCount });
    return { finalOutput: "Agent assessment.", state: { usage: usageOverride }, newItems: toolCount ? [{ type: "tool_call_item" }] : [] };
  });
  const response = await runReadOnlyPoAgentWithRuntime(question, { environment: { OPENAI_API_KEY: "fixture", ...extraEnvironment }, loaded, runner });
  expect(runner).toHaveBeenCalledTimes(1);
  return response;
}
