import type { IntelligenceRegistrySnapshot, ModelApproval, ModelDescriptor, ProviderDescriptor } from "../registry";
import type { IntelligenceTaskRequest, ModelCapabilities } from "../types";

export const fullCapabilities: ModelCapabilities = { textGeneration: true, toolCalling: true, structuredOutput: true, streaming: true, reasoning: true, vision: false, embeddings: false, maxContextTokens: 10_000, localExecution: false, offlineCapable: false };
const health = { state: "HEALTHY" as const, lastCheckedAt: "2026-08-23T00:00:00Z", latencyMs: 100, failureReason: null };
export const providers: ProviderDescriptor[] = [
  { providerId: "local-fixture", adapterKind: "test_fake", local: true, allowedPrivacyClasses: ["PUBLIC", "INTERNAL", "PRIVATE_ATHLETE", "RESTRICTED"], health },
  { providerId: "hosted-fixture", adapterKind: "test_fake", local: false, allowedPrivacyClasses: ["PUBLIC", "INTERNAL"], health },
  { providerId: "frontier-fixture", adapterKind: "test_fake", local: false, allowedPrivacyClasses: ["PUBLIC", "INTERNAL", "PRIVATE_ATHLETE"], health },
];
export const models: ModelDescriptor[] = [
  { providerId: "local-fixture", modelId: "local-model", modelVersion: "fixture-v1", tier: "TIER_1_LOCAL", capabilities: { ...fullCapabilities, localExecution: true, offlineCapable: true } },
  { providerId: "hosted-fixture", modelId: "hosted-model", modelVersion: "fixture-v1", tier: "TIER_2_HOSTED_LOW_COST", capabilities: fullCapabilities },
  { providerId: "frontier-fixture", modelId: "frontier-model", modelVersion: "fixture-v1", tier: "TIER_3_FRONTIER", capabilities: fullCapabilities },
];
export const approvals: ModelApproval[] = models.map((model) => ({ taskClass: "po_scope_explanation", providerId: model.providerId, modelId: model.modelId, status: "approved", benchmarkVersion: "fixture-b1", approvedAt: "2026-08-23", rationale: "Test fixture only." }));
export const registry = (overrides: Partial<IntelligenceRegistrySnapshot> = {}): IntelligenceRegistrySnapshot => ({
  providers, models, approvals,
  pricing: models.map((model) => ({ providerId: model.providerId, modelId: model.modelId, inputPerMillion: 1, cachedInputPerMillion: 0.1, outputPerMillion: 2, effectiveDate: "2026-08-23", source: "test fixture" })),
  localAvailable: true,
  ...overrides,
});
export const request = (overrides: Partial<IntelligenceTaskRequest> = {}): IntelligenceTaskRequest => ({
  taskId: "task-1", taskClass: "po_scope_explanation", domain: "project_owner", privacyClass: "INTERNAL", requiredCapabilities: ["textGeneration"],
  preferredTier: "TIER_2_HOSTED_LOW_COST", maxTier: "TIER_3_FRONTIER",
  contextBudget: { maxInputTokens: 4_000, maxEvidenceItems: 10, maxEvidenceTokens: 3_000, reserveOutputTokens: 500, truncationPolicy: "OMIT_LOW_AUTHORITY" },
  latencyBudget: { maxLatencyMs: 2_000 }, costBudget: { enforcement: "HARD", maxUsd: 1, expectedInputTokens: 1_000, expectedOutputTokens: 500 },
  evidencePacket: { items: [{ id: "canonical", authority: "CANONICAL", required: true, estimatedTokens: 500, content: "private raw fixture" }], estimatedTokens: 500, omittedItems: [], budgetStatus: "FIT" },
  allowEscalation: true, inferenceRequirement: "required", deterministicPathAvailable: false, metadata: { feature: "test" }, ...overrides,
});
