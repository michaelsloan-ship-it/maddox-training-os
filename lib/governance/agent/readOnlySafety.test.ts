import { describe, expect, it } from "vitest";

import { evaluateReadOnlyRequest } from "./readOnlyPolicy";
import { readToolRegistry } from "./readToolRegistry";
import { assertPoAgentExecutionAllowed, DEFAULT_PO_AGENT_MODEL, getPoAgentConfiguration } from "./orchestrator";
import { createPortfolioReadService } from "../read/portfolioReadService";
import { loadCanonicalPortfolio } from "../server/portfolioLoader";

describe("Phase B read-only safety contract", () => {
  it("registers the approved read tools, including deterministic next work, and no write-capable capability", () => {
    expect(readToolRegistry.map((tool) => tool.name)).toEqual([
      "get_portfolio_summary", "get_scope_item", "search_scope", "get_scope_diagnostics", "get_scope_dependencies",
      "get_priority_distribution", "get_status_distribution", "get_scope_wsjf", "get_missing_evidence", "compare_scope_items", "get_next_work_candidates",
    ]);
    expect(readToolRegistry.every((tool) => tool.capability === "read")).toBe(true);
    expect(readToolRegistry.map((tool) => `${tool.name} ${tool.description}`).join(" ")).not.toMatch(/shell|apply_patch|filesystem write|markdown write|github write|supabase write|http mutation|persist mutation/i);
  });

  it("flags make-this-P0 as recommendation-only and leaves canonical state unchanged", async () => {
    const loaded = await loadCanonicalPortfolio({ sourceRevision: "test-sha" });
    const before = JSON.stringify(loaded.portfolio);
    const service = createPortfolioReadService(loaded);
    expect(evaluateReadOnlyRequest("Make GOV-PO-AGENT-001 P0")).toMatchObject({ requestsCanonicalChange: true, notice: expect.stringContaining("canonical scope remains unchanged") });
    service.getScopeItem({ scopeId: "GOV-PO-AGENT-001" });
    expect(JSON.stringify(loaded.portfolio)).toBe(before);
  });

  it("uses the supported default model, permits a supported override, and rejects an invalid override", () => {
    expect(DEFAULT_PO_AGENT_MODEL).toBe("gpt-5.6-sol");
    expect(getPoAgentConfiguration({ OPENAI_API_KEY: "server-secret" })).toMatchObject({ configured: true, model: "gpt-5.6-sol", modelSupported: true });
    expect(getPoAgentConfiguration({ OPENAI_API_KEY: "server-secret", PO_AGENT_MODEL: "gpt-5.6-terra" })).toMatchObject({ configured: true, model: "gpt-5.6-terra", modelSupported: true });
    expect(() => assertPoAgentExecutionAllowed({ OPENAI_API_KEY: "server-secret", PO_AGENT_MODEL: "invented-model" })).toThrow("model configuration is unsupported");
  });

  it("reports absent configuration without exposing a secret", () => {
    expect(JSON.stringify(getPoAgentConfiguration({ OPENAI_API_KEY: "server-secret" }))).not.toContain("server-secret");
    expect(getPoAgentConfiguration({})).toMatchObject({ configured: false });
  });
});
