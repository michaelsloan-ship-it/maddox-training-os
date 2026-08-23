import { describe, expect, it } from "vitest";
import { enforceContextBudget } from "./context/budget";
import { createRouteTelemetry } from "./observability";
import { planIntelligenceRoute } from "./routing/policy";
import { registry, request } from "./routing/testFixtures";

describe("privacy-safe route observability", () => {
  it("does not copy evidence, secrets, metadata, or endpoint details into telemetry", () => {
    const task = request({ privacyClass: "PRIVATE_ATHLETE", metadata: { secret: "do-not-log", localEndpoint: "http://localhost:9999" } });
    const context = enforceContextBudget(task.evidencePacket.items, task.contextBudget);
    const decision = planIntelligenceRoute(task, registry());
    const telemetry = createRouteTelemetry(task, decision, context, { estimatedCost: { available: false, amountUsd: null, assumption: null, missingReason: "fixture" } });
    const serialized = JSON.stringify(telemetry);
    expect(serialized).not.toContain("private raw fixture");
    expect(serialized).not.toContain("do-not-log");
    expect(serialized).not.toContain("localhost");
    expect(telemetry).toMatchObject({ taskId: "task-1", privacyClass: "PRIVATE_ATHLETE", outcome: "planned" });
  });
});
