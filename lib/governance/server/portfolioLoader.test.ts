import { describe, expect, it } from "vitest";

import { loadCanonicalPortfolio, resolveSourceRevision } from "./portfolioLoader";

describe("server-only canonical portfolio loader", () => {
  it("loads current SCOPE through the deterministic parser and propagates diagnostics", async () => {
    const loaded = await loadCanonicalPortfolio({ sourceRevision: "test-sha" });
    expect(loaded.portfolio.metadata).toMatchObject({ sourceFilePath: "docs/SCOPE.md", sourceGitSha: "test-sha" });
    expect(loaded.diagnostics).toBeInstanceOf(Array);
    for (const id of ["GOV-PO-AGENT-001", "ADMIN-PROJECT-OWNER-CONSOLE-001", "GOV-ADMIN-AUTH-HARDENING-001"]) {
      expect(loaded.portfolio.items.filter((item) => item.id === id), id).toHaveLength(1);
    }
  });

  it("uses explicit build metadata and never fabricates a local SHA", () => {
    expect(resolveSourceRevision({ VERCEL_GIT_COMMIT_SHA: "vercel-sha" })).toBe("vercel-sha");
    expect(resolveSourceRevision({})).toBe("unknown/local");
  });
});
