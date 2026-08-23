import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { parseScopeMarkdown } from "./parser";
import { validatePortfolio } from "./validation";

function record(id: string, overrides: Partial<Record<string, string>> = {}) {
  const values = {
    Title: `${id} title`, Type: "Feature", Parent: "Governance", Priority: "P1", Status: "Not started",
    Lane: "Safe lane", Owner: "Mike", Source: "Test", Problem: "A problem", "Desired outcome": "An outcome",
    "In scope": "bounded work", "Out of scope": "unrelated work", "Acceptance criteria": "deterministic result",
    Dependencies: "none", Risks: "drift", "Next action": "test", "Links / evidence": "fixture",
    ...overrides,
  };
  return `### ${id}\n\n- ID: ${id}\n${Object.entries(values).map(([key, value]) => `- ${key}: ${value}`).join("\n")}\n`;
}

function parse(markdown: string) {
  return parseScopeMarkdown({ markdown, sourceFilePath: "docs/SCOPE.md", sourceGitSha: "abc123" });
}

describe("deterministic SCOPE parser", () => {
  it("parses a valid detailed record and preserves snapshot metadata", () => {
    const result = parse(record("TEST-ITEM-001"));
    expect(result.portfolio.items).toHaveLength(1);
    expect(result.portfolio.items[0]).toMatchObject({ id: "TEST-ITEM-001", priority: "P1", status: "Not started", missingFields: [] });
    expect(result.portfolio.metadata).toMatchObject({ sourceFilePath: "docs/SCOPE.md", sourceGitSha: "abc123", parsedAt: null });
    expect(result.portfolio.metadata.sourceContentHash).toMatch(/^fnv1a-/);
  });

  it("parses multiple records without using line numbers as identity", () => {
    const result = parse(`${record("TEST-ONE-001")}\nprose between records\n${record("TEST-TWO-001")}`);
    expect(result.portfolio.items.map((item) => item.id)).toEqual(["TEST-ONE-001", "TEST-TWO-001"]);
    expect(result.portfolio.items.every((item) => !("line" in item.sourceLocation))).toBe(true);
  });

  it("reports duplicate detailed IDs", () => {
    const result = parse(`${record("TEST-DUPLICATE-001")}\n${record("TEST-DUPLICATE-001")}`);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: "duplicate_detailed_id", severity: "error", scopeId: "TEST-DUPLICATE-001" }));
    expect(validatePortfolio(result.portfolio)).toContainEqual(expect.objectContaining({ code: "duplicate_scope_id" }));
  });

  it("preserves missing fields explicitly", () => {
    const markdown = record("TEST-MISSING-001").replace("- Owner: Mike\n", "");
    const result = parse(markdown);
    expect(result.portfolio.items[0].owner).toBeNull();
    expect(result.portfolio.items[0].missingFields).toContain("owner");
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: "missing_field", fieldPath: "owner" }));
  });

  it("reports a malformed ambiguous record instead of repairing it", () => {
    const markdown = record("TEST-HEADING-001").replace("- ID: TEST-HEADING-001", "- ID: TEST-BODY-001");
    const result = parse(markdown);
    expect(result.portfolio.items[0].id).toBe("TEST-BODY-001");
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: "ambiguous_record_id", severity: "error" }));
  });

  it("cross-references queue and index rows and reports unknown detailed records", () => {
    const markdown = `## Active Execution Queue\n\n| Order | ID |\n| --- | --- |\n| 1 | TEST-KNOWN-001 |\n| 2 | TEST-UNKNOWN-001 |\n\n## Scope Item Index By Priority And Status\n\n| Status | IDs |\n| --- | --- |\n| Not started | TEST-KNOWN-001 |\n\n## Detailed Scope Records\n\n${record("TEST-KNOWN-001")}`;
    const result = parse(markdown);
    expect(result.portfolio.references.map((reference) => reference.scopeId)).toContain("TEST-UNKNOWN-001");
    expect(validatePortfolio(result.portfolio)).toContainEqual(expect.objectContaining({ code: "unknown_scope_reference", scopeId: "TEST-UNKNOWN-001" }));
  });

  it("parses the current canonical records uniquely", () => {
    const markdown = readFileSync("docs/SCOPE.md", "utf8");
    const result = parseScopeMarkdown({ markdown, sourceFilePath: "docs/SCOPE.md", sourceGitSha: "working-tree" });
    for (const id of ["GOV-PO-AGENT-001", "ADMIN-PROJECT-OWNER-CONSOLE-001", "GOV-ADMIN-AUTH-HARDENING-001"]) {
      expect(result.portfolio.items.filter((item) => item.id === id), id).toHaveLength(1);
    }
    expect(result.diagnostics.filter((diagnostic) => diagnostic.code === "duplicate_detailed_id")).toEqual([]);
  });
});
