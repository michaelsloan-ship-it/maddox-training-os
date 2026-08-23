import { describe, expect, it } from "vitest";

import { parseScopeMarkdown } from "../parser";
import { getNextWorkCandidates } from "./nextWorkCandidates";

const fixture = `# Scope

## Current Checkpoint

- Environment isolation is complete for ENV-SAFETY-LOCAL-PROD-GUARD.

## Active Execution Queue

| Order | ID | Title | Priority | Status | Lane | Next action |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | ENV-SAFETY-LOCAL-PROD-GUARD | Local guard | P0 | Scope review required | Safe lane | Review stale record. |
| 2 | SPORT-SCHEDULE-VERIFY-001 | Verify claims | P0 | Scope review required | Source-review | Apply during future source review. |
| 3 | DEF-DAY-DURATION-CONTRACT-001 | Duration contract | P1 | In progress | Fast lane | Resolve duration semantics. |

## Current Sprint / Next Codex Task

- Prioritize DEF-DAY-DURATION-CONTRACT-001 next to resolve the athlete-trust duration issue.
- Environment isolation is complete for ENV-SAFETY-LOCAL-PROD-GUARD.

### PREREQ-001
- ID: PREREQ-001
- Title: Prerequisite
- Type: Task
- Parent: Test
- Priority: P1
- Status: Completed
- Lane: Fast lane
- Owner: Mike
- Source: Fixture
- Problem: Done.
- Desired outcome: Done.
- In scope: fixture.
- Out of scope: none.
- Acceptance criteria: done.
- Dependencies: none.
- Risks: none.
- Next action: none.
- Links / evidence: fixture.

### ENV-SAFETY-LOCAL-PROD-GUARD
- ID: ENV-SAFETY-LOCAL-PROD-GUARD
- Title: Local startup guard
- Type: Task
- Parent: Safety
- Priority: P0
- Status: Scope review required
- Lane: Safe lane
- Owner: Mike
- Source: Fixture
- Problem: Potential stale guard.
- Desired outcome: Safe writes.
- In scope: review.
- Out of scope: implementation.
- Acceptance criteria: reviewed.
- Dependencies: PREREQ-001.
- Risks: stale evidence.
- Next action: review after prerequisite.
- Links / evidence: fixture.

### SPORT-SCHEDULE-VERIFY-001
- ID: SPORT-SCHEDULE-VERIFY-001
- Title: Verify future schedule claims
- Type: Source Review
- Parent: Training
- Priority: P0
- Status: Scope review required
- Lane: Source-review
- Owner: Mike
- Source: Fixture
- Problem: Future claims need proof.
- Desired outcome: Verified claims.
- In scope: future source review.
- Out of scope: immediate execution.
- Acceptance criteria: verified.
- Dependencies: source documents.
- Risks: plan corruption.
- Next action: apply during future source-review tasks.
- Links / evidence: fixture.

### DEF-DAY-DURATION-CONTRACT-001
- ID: DEF-DAY-DURATION-CONTRACT-001
- Title: Duration scopes disagree
- Type: Defect
- Parent: Day
- Priority: P1
- Status: In progress
- Lane: Fast lane
- Owner: Mike
- Source: Fixture
- Problem: Athlete-trust issue.
- Desired outcome: Defined duration semantics.
- In scope: deterministic correction.
- Out of scope: source edits.
- Acceptance criteria: scopes defined.
- Dependencies: none.
- Risks: athlete trust.
- Next action: determine authoritative duration semantics.
- Links / evidence: fixture.

### BLOCKED-001
- ID: BLOCKED-001
- Title: Blocked item
- Type: Task
- Parent: Test
- Priority: P0
- Status: Blocked
- Lane: Safe lane
- Owner: Mike
- Source: Fixture
- Problem: Blocked.
- Desired outcome: Unblocked.
- In scope: fixture.
- Out of scope: none.
- Acceptance criteria: done.
- Dependencies: MISSING-PREREQ-001.
- Risks: none.
- Next action: obtain missing prerequisite.
- Links / evidence: fixture.

### DEFERRED-001
- ID: DEFERRED-001
- Title: Deferred item
- Type: Task
- Parent: Test
- Priority: P0
- Status: Deferred
- Lane: Future roadmap
- Owner: Mike
- Source: Fixture
- Problem: Later.
- Desired outcome: Later.
- In scope: fixture.
- Out of scope: now.
- Acceptance criteria: later.
- Dependencies: none.
- Risks: none.
- Next action: defer.
- Links / evidence: fixture.
`;

describe("deterministic next-work candidates", () => {
  const portfolio = parseScopeMarkdown({ markdown: fixture, sourceFilePath: "docs/SCOPE.md", sourceGitSha: "fixture" }).portfolio;
  const result = getNextWorkCandidates(portfolio);

  it("uses current-sprint lifecycle evidence without hard-coding a winner", () => {
    expect(result.executableCandidates[0]).toMatchObject({ scopeId: "DEF-DAY-DURATION-CONTRACT-001", lifecycleEligibility: "ELIGIBLE_EXECUTION" });
    expect(result.rankingPolicy.join(" ")).not.toContain("DEF-DAY-DURATION-CONTRACT-001");
  });

  it("keeps stale P0 and future source review out of executable work", () => {
    expect(result.executableCandidates.map((item) => item.scopeId)).not.toContain("ENV-SAFETY-LOCAL-PROD-GUARD");
    expect(result.reconciliationCandidates.find((item) => item.scopeId === "ENV-SAFETY-LOCAL-PROD-GUARD")).toMatchObject({ reconciliationRequired: true, contradictionList: [expect.stringContaining("Scope review required")] });
    expect(result.reviewCandidates.find((item) => item.scopeId === "SPORT-SCHEDULE-VERIFY-001")).toMatchObject({ lifecycleEligibility: "ELIGIBLE_REVIEW" });
  });

  it("does not turn a completed prerequisite into execution readiness", () => {
    expect(result.reconciliationCandidates.find((item) => item.scopeId === "ENV-SAFETY-LOCAL-PROD-GUARD")?.prerequisiteState.completedScopeIds).toContain("PREREQ-001");
  });

  it("excludes completed, deferred, and blocked work with explicit reasons", () => {
    expect(result.excludedCandidates.find((item) => item.scopeId === "PREREQ-001")?.lifecycleEligibility).toBe("COMPLETED");
    expect(result.excludedCandidates.find((item) => item.scopeId === "DEFERRED-001")?.lifecycleEligibility).toBe("DEFERRED");
    expect(result.excludedCandidates.find((item) => item.scopeId === "BLOCKED-001")).toMatchObject({ lifecycleEligibility: "BLOCKED", blockingState: { blocked: true } });
  });
});
