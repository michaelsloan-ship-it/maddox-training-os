import { describe, expect, it } from "vitest";

import { classifyPoTask } from "./poTaskPolicy";

describe("deterministic PO task classification", () => {
  it.each([
    ["What should we work on next?", "po_next_work_explanation"],
    ["Explain GOV-PO-AGENT-001.", "po_scope_explanation"],
    ["Compare GOV-PO-AGENT-001 and MODEL-ROUTING-001.", "po_scope_comparison"],
    ["Give me a portfolio summary.", "po_portfolio_synthesis"],
    ["Architecture review MODEL-ROUTING-001.", "po_architecture_review"],
  ])("classifies %s", (question, taskClass) => {
    expect(classifyPoTask(question)).toMatchObject({ status: "supported", taskClass });
  });

  it("falls back conservatively for unsupported and ambiguous questions", () => {
    expect(classifyPoTask("How are things?")).toMatchObject({ status: "unsupported", taskClass: null });
    expect(classifyPoTask("What should we work on next? Also give a portfolio summary.")).toMatchObject({ status: "ambiguous", taskClass: null });
    expect(classifyPoTask("Compare GOV-PO-AGENT-001.")).toMatchObject({ status: "ambiguous", taskClass: null });
  });
});
