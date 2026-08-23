import type { IntelligenceTaskClass, IntelligenceTier, ModelCapabilities, PrivacyClass } from "./types";
import type { ModelPricing } from "./pricing/types";

export const providerHealthStates = ["HEALTHY", "DEGRADED", "UNAVAILABLE", "UNKNOWN"] as const;
export type ProviderHealthState = (typeof providerHealthStates)[number];
export interface ProviderHealth { state: ProviderHealthState; lastCheckedAt: string | null; latencyMs: number | null; failureReason: string | null }

export interface ProviderDescriptor {
  providerId: string;
  adapterKind: "openai" | "openai_compatible" | "bedrock" | "future_local" | "test_fake";
  local: boolean;
  allowedPrivacyClasses: PrivacyClass[];
  health: ProviderHealth;
}

export interface ModelDescriptor {
  providerId: string;
  modelId: string;
  modelVersion: string | null;
  tier: Exclude<IntelligenceTier, "TIER_0_DETERMINISTIC">;
  capabilities: ModelCapabilities;
}

export interface ModelApproval {
  taskClass: IntelligenceTaskClass;
  providerId: string;
  modelId: string;
  status: "experimental" | "approved" | "disallowed";
  benchmarkVersion: string | null;
  approvedAt: string | null;
  rationale: string;
}

export interface IntelligenceRegistrySnapshot {
  providers: ProviderDescriptor[];
  models: ModelDescriptor[];
  approvals: ModelApproval[];
  pricing: ModelPricing[];
  localAvailable: boolean;
}

export function modelApprovalFor(registry: IntelligenceRegistrySnapshot, taskClass: IntelligenceTaskClass, providerId: string, modelId: string) {
  return registry.approvals.find((approval) => approval.taskClass === taskClass && approval.providerId === providerId && approval.modelId === modelId) ?? null;
}
