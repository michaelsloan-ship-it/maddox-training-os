import { describe, expect, it } from "vitest";

import { resolvePortfolioStateEvidence } from "./evidencePolicy";

describe("bounded portfolio evidence policy", () => {
  it("prefers the detailed canonical record and surfaces stale narrative contradiction", () => {
    const result = resolvePortfolioStateEvidence([
      { value: "In progress", authority: "canonical_detailed_record", evidenceRef: "GOV-PO-AGENT-001.Status" },
      { value: "Not started", authority: "historical_checkpoint_narrative", evidenceRef: "old checkpoint" },
    ]);
    expect(result.selected).toMatchObject({ value: "In progress", authority: "canonical_detailed_record" });
    expect(result.contradictions).toEqual([expect.objectContaining({ value: "Not started" })]);
    expect(result.policy).toContain("never silently merged");
  });

  it("keeps absent evidence explicitly missing", () => {
    expect(resolvePortfolioStateEvidence([])).toMatchObject({ selected: null, contradictions: [], missing: true });
  });
});
