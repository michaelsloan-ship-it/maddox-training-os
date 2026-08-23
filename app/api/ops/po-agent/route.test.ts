import { describe, expect, it } from "vitest";

import { handlePoAgentPost } from "@/lib/governance/server/poAgentApi";

function request(body: unknown) {
  return new Request("http://localhost/api/ops/po-agent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

describe("read-only PO Agent API", () => {
  it.each([{ question: "" }, { question: " ".repeat(5) }, { question: "x".repeat(2001) }, {}, { question: "valid", extra: true }])("rejects invalid payload %#", async (body) => {
    const response = await handlePoAgentPost(request(body), { runner: async () => { throw new Error("runner must not execute"); } });
    expect(response.status).toBe(400);
  });

  it("fails explicitly when server agent configuration is absent", async () => {
    const response = await handlePoAgentPost(request({ question: "What next?" }), { environment: {} });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "PO Agent is not configured on the server.", configured: false, readOnly: true });
  });

  it("returns a bounded response without serializing server secrets", async () => {
    const response = await handlePoAgentPost(request({ question: "Explain scope" }), {
      environment: { OPENAI_API_KEY: "server-secret" },
      runner: async () => ({ answer: "Observed fact.", readOnly: true, canonicalSource: "docs/SCOPE.md", sourceRevision: "test-sha", diagnosticCount: 0, usage: { model: "gpt-5.6-sol", inputTokens: 10, outputTokens: 5, totalTokens: 15, cachedInputTokens: null, uncachedInputTokens: 10, estimatedCostUsd: 0.001, costLabel: "ESTIMATED", costAssumption: "assumes_uncached_input", costLimitation: null } }),
    });
    const serialized = JSON.stringify(await response.json());
    expect(response.status).toBe(200);
    expect(serialized).toContain("Observed fact");
    expect(serialized).not.toContain("OPENAI_API_KEY");
    expect(serialized).not.toContain("server-secret");
  });

  it.each([undefined, "false"])("fails closed in Production when enablement is %s", async (enabled) => {
    let invocations = 0;
    const response = await handlePoAgentPost(request({ question: "Explain scope" }), {
      environment: { VERCEL_ENV: "production", OPENAI_API_KEY: "server-secret", PO_AGENT_ENABLED: enabled },
      runner: async () => { invocations += 1; throw new Error("must not run"); },
    });
    expect(response.status).toBe(503);
    expect(invocations).toBe(0);
  });

  it("fails closed in Preview without explicit enablement", async () => {
    let invocations = 0;
    const response = await handlePoAgentPost(request({ question: "Explain scope" }), {
      environment: { VERCEL_ENV: "preview", OPENAI_API_KEY: "server-secret" },
      runner: async () => { invocations += 1; throw new Error("must not run"); },
    });
    expect(response.status).toBe(503);
    expect(invocations).toBe(0);
  });

  it("fails explicitly before invocation when the configured model is unsupported", async () => {
    let invocations = 0;
    const response = await handlePoAgentPost(request({ question: "Explain scope" }), {
      environment: { OPENAI_API_KEY: "server-secret", PO_AGENT_MODEL: "invented-model" },
      runner: async () => { invocations += 1; throw new Error("must not run"); },
    });
    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain("model configuration is unsupported");
    expect(invocations).toBe(0);
  });

  it("allows explicitly enabled Production to reach the mocked agent boundary", async () => {
    let invocations = 0;
    const response = await handlePoAgentPost(request({ question: "Explain scope" }), {
      environment: { VERCEL_ENV: "production", OPENAI_API_KEY: "server-secret", PO_AGENT_ENABLED: "true" },
      runner: async () => {
        invocations += 1;
        return { answer: "Observed fact.", readOnly: true, canonicalSource: "docs/SCOPE.md", sourceRevision: "test-sha", diagnosticCount: 0, usage: { model: "gpt-5.6-sol", inputTokens: null, outputTokens: null, totalTokens: null, cachedInputTokens: null, uncachedInputTokens: null, estimatedCostUsd: null, costLabel: "ESTIMATED", costAssumption: null, costLimitation: "Usage unavailable." } };
      },
    });
    expect(response.status).toBe(200);
    expect(invocations).toBe(1);
  });
});
