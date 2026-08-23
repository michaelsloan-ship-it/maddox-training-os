import { beforeAll, describe, expect, it } from "vitest";

import { loadCanonicalPortfolio, type LoadedCanonicalPortfolio } from "../server/portfolioLoader";
import { createPortfolioReadService, type PortfolioReadService } from "./portfolioReadService";

let loaded: LoadedCanonicalPortfolio;
let service: PortfolioReadService;

beforeAll(async () => {
  loaded = await loadCanonicalPortfolio({ sourceRevision: "test-sha" });
  service = createPortfolioReadService(loaded);
});

describe("typed portfolio read service", () => {
  it("returns exact records and explicit unknown IDs", () => {
    expect(service.getScopeItem({ scopeId: "GOV-PO-AGENT-001" })).toMatchObject({ found: true, item: { id: "GOV-PO-AGENT-001" }, authority: "canonical_detailed_record" });
    expect(service.getScopeItem({ scopeId: "UNKNOWN-001" })).toEqual({ found: false, scopeId: "UNKNOWN-001" });
  });

  it("searches structured scope fields", () => {
    expect(service.searchScope({ query: "Project Owner Intelligence" }).map((item) => item.id)).toContain("GOV-PO-AGENT-001");
  });

  it("returns explicit dependencies without inferring graph edges", () => {
    const result = service.getScopeDependencies({ scopeId: "ADMIN-PROJECT-OWNER-CONSOLE-001" });
    expect(result).toMatchObject({ found: true, directDependencies: [], note: expect.stringContaining("not inferred") });
  });

  it("returns deterministic priority and status distributions", () => {
    expect(service.getPriorityDistribution().P1).toBeGreaterThan(0);
    expect(Object.keys(service.getStatusDistribution()).length).toBeGreaterThan(0);
  });

  it("keeps WSJF unavailable and surfaces missing score evidence", () => {
    expect(service.getScopeWsjf({ scopeId: "GOV-PO-AGENT-001" })).toMatchObject({ found: true, result: { available: false } });
    expect(service.getMissingEvidence({ scopeId: "GOV-PO-AGENT-001" })).toMatchObject({ found: true, notScored: true, resolution: expect.stringContaining("do not assign defaults") });
  });

  it("compares records without changing canonical state and exposes diagnostics", () => {
    const before = JSON.stringify(loaded.portfolio);
    const comparison = service.compareScopeItems({ scopeIds: ["GOV-PO-AGENT-001", "ADMIN-PROJECT-OWNER-CONSOLE-001"] });
    expect(comparison).toMatchObject({ canonicalUnchanged: true, items: [{ id: "GOV-PO-AGENT-001" }, { id: "ADMIN-PROJECT-OWNER-CONSOLE-001" }] });
    expect(JSON.stringify(loaded.portfolio)).toBe(before);
    expect(service.getScopeDiagnostics()).toEqual({ count: loaded.diagnostics.length, diagnostics: loaded.diagnostics });
  });

  it("uses canonical sprint evidence for deterministic next-work candidates and propagates stale contradictions", () => {
    const candidates = service.getNextWorkCandidates();
    expect(candidates.executableCandidates[0]?.scopeId).toBe("DEF-DAY-DURATION-CONTRACT-001");
    expect(candidates.executableCandidates.map((candidate) => candidate.scopeId)).not.toContain("ENV-SAFETY-LOCAL-PROD-GUARD");
    expect(candidates.reconciliationCandidates.find((candidate) => candidate.scopeId === "ENV-SAFETY-LOCAL-PROD-GUARD")?.contradictionList).toEqual(expect.arrayContaining([expect.stringContaining("Scope review required")]));
    expect(service.getScopeItem({ scopeId: "ENV-SAFETY-LOCAL-PROD-GUARD" })).toMatchObject({ found: true, contradictions: [expect.stringContaining("Scope review required")] });
  });
});
