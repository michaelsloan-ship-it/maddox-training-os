import { beforeAll, describe, expect, it } from "vitest";

import { createPortfolioReadService, type PortfolioReadService } from "../read/portfolioReadService";
import { loadCanonicalPortfolio, type LoadedCanonicalPortfolio } from "../server/portfolioLoader";
import { buildPoEvidencePacket } from "./poEvidencePacketBuilder";
import { getPoContextBudget } from "./poEvidencePolicy";
import { classifyPoTask } from "./poTaskPolicy";

let loaded: LoadedCanonicalPortfolio;
let service: PortfolioReadService;

beforeAll(async () => {
  loaded = await loadCanonicalPortfolio({ sourceRevision: "fixture-sha" });
  service = createPortfolioReadService(loaded);
});

describe("PO evidence packet builder", () => {
  it("builds a bounded next-work projection without full excluded portfolio content", () => {
    const result = build("What should we work on next?");
    const serialized = JSON.stringify(result.context.packet);
    expect(result.context.packet.budgetStatus).not.toBe("REJECTED");
    expect(result.mandatoryEvidenceRetained).toBe(true);
    expect(serialized).toContain("DEF-DAY-DURATION-CONTRACT-001");
    expect(serialized).toContain("ENV-SAFETY-LOCAL-PROD-GUARD");
    expect(serialized).toContain("SPORT-SCHEDULE-VERIFY-001");
    expect(serialized).toContain("ELIGIBLE_REVIEW");
    expect(serialized).toContain("Scope review required");
    expect(serialized).toContain("missingScoreEvidence");
    expect(serialized).toContain("fixture-sha");
    expect(serialized).not.toContain('"excludedCandidates"');
    expect(result.context.packet.items.map((item) => item.id)).toContain("next-work-strongest-executable-alternative");
    expect(result.legacyEstimatedTokens).toBeGreaterThan(result.context.packet.estimatedTokens);
  });

  it("preserves task-specific scope, comparison, synthesis, and architecture evidence", () => {
    for (const question of [
      "Explain GOV-PO-AGENT-001.",
      "Compare GOV-PO-AGENT-001 and MODEL-ROUTING-001.",
      "Give me a portfolio summary.",
      "Architecture review MODEL-ROUTING-001.",
    ]) {
      const result = build(question);
      expect(result.context.packet.items[0]).toMatchObject({ id: "provenance", required: true });
      expect(result.context.packet.budgetStatus).not.toBe("REJECTED");
      expect(result.mandatoryEvidenceRetained).toBe(true);
    }
  });

  it("reports optional truncation and rejects when mandatory evidence cannot fit", () => {
    const synthesis = supported("Give me a portfolio summary.");
    const truncated = buildPoEvidencePacket({ classification: synthesis, service, canonicalSource: "docs/SCOPE.md", sourceRevision: "fixture-sha", budget: { maxInputTokens: 6_000, maxEvidenceItems: 3, maxEvidenceTokens: 4_500, reserveOutputTokens: 1_200, truncationPolicy: "OMIT_LOW_AUTHORITY" } });
    expect(truncated.context.packet.budgetStatus).toBe("TRUNCATED");
    expect(truncated.context.packet.omittedItems.length).toBeGreaterThan(0);
    expect(truncated.context.packet.omittedItems.every((item) => !item.required)).toBe(true);
    const classification = supported("What should we work on next?");
    const rejected = buildPoEvidencePacket({ classification, service, canonicalSource: "docs/SCOPE.md", sourceRevision: "fixture-sha", budget: { maxInputTokens: 10, maxEvidenceItems: 1, maxEvidenceTokens: 10, reserveOutputTokens: 1, truncationPolicy: "OMIT_LOW_AUTHORITY" } });
    expect(rejected.context.packet.budgetStatus).toBe("REJECTED");
    expect(rejected.mandatoryEvidenceRetained).toBe(false);
    expect(rejected.context.packet.omittedItems.some((item) => item.required)).toBe(true);
  });
});

function build(question: string) {
  const classification = supported(question);
  return buildPoEvidencePacket({ classification, service, canonicalSource: "docs/SCOPE.md", sourceRevision: "fixture-sha", budget: getPoContextBudget(classification.taskClass) });
}

function supported(question: string) {
  const classification = classifyPoTask(question);
  if (classification.status !== "supported" || !classification.taskClass) throw new Error("Expected supported fixture question.");
  return { ...classification, status: "supported" as const, taskClass: classification.taskClass };
}
