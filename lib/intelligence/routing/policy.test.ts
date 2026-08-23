import { describe, expect, it } from "vitest";
import { PlanningModelGateway } from "../gateway";
import { planIntelligenceRoute } from "./policy";
import { approvals, fullCapabilities, models, providers, registry, request } from "./testFixtures";

describe("deterministic intelligence routing", () => {
  it("routes inferenceRequirement none to Tier 0 without considering models", () => {
    expect(planIntelligenceRoute(request({ inferenceRequirement: "none" }), registry())).toMatchObject({ selectedTier: "TIER_0_DETERMINISTIC", deterministicNoModel: true, success: true, consideredCandidates: [] });
  });

  it("never infers Tier 0 from required inference with empty capabilities", () => {
    expect(planIntelligenceRoute(request({ inferenceRequirement: "required", requiredCapabilities: [] }), registry())).toMatchObject({ selectedTier: "TIER_1_LOCAL", deterministicNoModel: false });
  });

  it("fails validation when inference requirement is missing or malformed", () => {
    expect(() => planIntelligenceRoute(request({ inferenceRequirement: undefined as never }), registry())).toThrow("Invalid inference requirement");
    expect(() => planIntelligenceRoute(request({ inferenceRequirement: "sometimes" as never }), registry())).toThrow("Invalid inference requirement");
  });

  it("uses Tier 0 for allowed inference only when the caller explicitly supplies a deterministic path", () => {
    expect(planIntelligenceRoute(request({ inferenceRequirement: "allowed", deterministicPathAvailable: true, metadata: { modelSelfConfidence: 0 } }), registry())).toMatchObject({ selectedTier: "TIER_0_DETERMINISTIC", deterministicNoModel: true });
    expect(planIntelligenceRoute(request({ inferenceRequirement: "allowed", deterministicPathAvailable: false, requiredCapabilities: [] }), registry())).toMatchObject({ selectedTier: "TIER_1_LOCAL", deterministicNoModel: false });
  });

  it("gives an approved healthy local model first right of refusal", () => {
    expect(planIntelligenceRoute(request(), registry())).toMatchObject({ selectedTier: "TIER_1_LOCAL", selectedProviderId: "local-fixture", selectedModelId: "local-model" });
  });

  it("falls back to Tier 2 when local is unavailable or degraded", () => {
    const unavailable = registry({ localAvailable: false });
    expect(planIntelligenceRoute(request(), unavailable)).toMatchObject({ selectedTier: "TIER_2_HOSTED_LOW_COST" });
    expect(planIntelligenceRoute(request(), unavailable).rejectedCandidates[0].reasons).toContain("local_unavailable");
    const degradedProviders = providers.map((provider) => provider.local ? { ...provider, health: { ...provider.health, state: "DEGRADED" as const } } : provider);
    expect(planIntelligenceRoute(request(), registry({ providers: degradedProviders }))).toMatchObject({ selectedTier: "TIER_2_HOSTED_LOW_COST" });
  });

  it("rejects local when task approval is absent and keeps approvals task-specific", () => {
    const onlyHostedApproved = approvals.filter((approval) => approval.providerId !== "local-fixture");
    expect(planIntelligenceRoute(request(), registry({ approvals: onlyHostedApproved }))).toMatchObject({ selectedTier: "TIER_2_HOSTED_LOW_COST" });
    const otherTask = request({ taskClass: "po_scope_comparison" });
    expect(planIntelligenceRoute(otherTask, registry())).toMatchObject({ success: false });
    expect(planIntelligenceRoute(otherTask, registry()).rejectedCandidates.every((candidate) => candidate.reasons.includes("not_task_approved"))).toBe(true);
  });

  it("enforces privacy as a hard constraint, including local-only RESTRICTED", () => {
    const decision = planIntelligenceRoute(request({ privacyClass: "RESTRICTED" }), registry({ localAvailable: false }));
    expect(decision.success).toBe(false);
    expect(decision.rejectedCandidates.filter((candidate) => candidate.providerId !== "local-fixture").every((candidate) => candidate.reasons.includes("privacy_not_allowed"))).toBe(true);
    expect(() => planIntelligenceRoute(request({ privacyClass: "UNKNOWN" as never }), registry())).toThrow("Invalid privacy class");
  });

  it("rejects missing capabilities and context overflow", () => {
    const noTools = models.map((model) => ({ ...model, capabilities: { ...model.capabilities, toolCalling: false } }));
    expect(planIntelligenceRoute(request({ requiredCapabilities: ["toolCalling"] }), registry({ models: noTools })).rejectedCandidates.every((candidate) => candidate.reasons.includes("capability_missing"))).toBe(true);
    const tinyModels = models.map((model) => ({ ...model, capabilities: { ...fullCapabilities, maxContextTokens: 600 } }));
    expect(planIntelligenceRoute(request(), registry({ models: tinyModels })).rejectedCandidates.every((candidate) => candidate.reasons.includes("context_limit"))).toBe(true);
  });

  it("keeps known estimates under a hard ceiling eligible and rejects known overages", () => {
    const underBudget = planIntelligenceRoute(request(), registry());
    expect(underBudget.success).toBe(true);
    expect(underBudget.consideredCandidates[0]).toMatchObject({ estimatedCost: { available: true } });
    const costly = request({ costBudget: { enforcement: "HARD", maxUsd: 0.000001, expectedInputTokens: 1_000, expectedOutputTokens: 500 } });
    expect(planIntelligenceRoute(costly, registry()).rejectedCandidates.every((candidate) => candidate.reasons.includes("cost_limit"))).toBe(true);
  });

  it("fails closed when hard-ceiling cost is unknown", () => {
    const unknown = planIntelligenceRoute(request(), registry({ pricing: [] }));
    expect(unknown.success).toBe(false);
    expect(unknown.rejectedCandidates.every((candidate) => candidate.reasons.includes("cost_unknown_under_hard_limit"))).toBe(true);
    expect(unknown.rejectedCandidates.every((candidate) => candidate.estimatedCost.amountUsd === null)).toBe(true);
    expect(JSON.stringify(unknown)).not.toContain('"amountUsd":0');
  });

  it("allows unknown cost under a soft informational ceiling while keeping it explicit", () => {
    const soft = request({ costBudget: { enforcement: "SOFT", maxUsd: 1, expectedInputTokens: 1_000, expectedOutputTokens: 500 } });
    const unknown = planIntelligenceRoute(soft, registry({ pricing: [] }));
    expect(unknown.success).toBe(true);
    expect(unknown.consideredCandidates.every((candidate) => !candidate.estimatedCost.available && candidate.estimatedCost.amountUsd === null)).toBe(true);
    expect(unknown.warnings).toContain("local-fixture/local-model: pricing unavailable");
  });

  it("keeps a known soft-budget overage eligible and reports it informationally", () => {
    const soft = request({ costBudget: { enforcement: "SOFT", maxUsd: 0.000001, expectedInputTokens: 1_000, expectedOutputTokens: 500 } });
    const decision = planIntelligenceRoute(soft, registry());
    expect(decision.success).toBe(true);
    expect(decision.rejectedCandidates.every((candidate) => !candidate.reasons.includes("cost_limit"))).toBe(true);
    expect(decision.warnings).toContain("local-fixture/local-model: estimated cost exceeds soft informational budget");
  });

  it("respects max tier and returns explicit failure when no route exists", () => {
    const noLocal = registry({ localAvailable: false, providers: providers.map((provider) => provider.providerId === "hosted-fixture" ? { ...provider, health: { ...provider.health, state: "UNAVAILABLE" as const } } : provider) });
    const decision = planIntelligenceRoute(request({ maxTier: "TIER_2_HOSTED_LOW_COST" }), noLocal);
    expect(decision.success).toBe(false);
    expect(decision.rejectedCandidates.find((candidate) => candidate.modelId === "frontier-model")?.reasons).toContain("tier_not_allowed");
  });

  it("builds bounded escalation without using model self-confidence", () => {
    const decision = planIntelligenceRoute(request({ metadata: { modelSelfConfidence: 0 } }), registry());
    expect(decision.escalationPlan.map((step) => step.tier)).toEqual(["TIER_2_HOSTED_LOW_COST", "TIER_3_FRONTIER"]);
    expect(JSON.stringify(decision)).not.toContain("modelSelfConfidence");
  });

  it("plan is dry-run only and never invokes provider execution", () => {
    const gateway = new PlanningModelGateway(registry());
    expect(gateway.plan(request()).success).toBe(true);
    expect(gateway.execute(request())).rejects.toThrow("not configured");
  });
});
