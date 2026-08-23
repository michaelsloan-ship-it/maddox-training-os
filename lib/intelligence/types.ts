import type { ContextBudget, ContextBudgetResult, EvidencePacket } from "./context/budget";
import type { CostBudget, EstimatedCost, UsageRecord } from "./pricing/types";

export const intelligenceTaskClasses = [
  "po_scope_explanation", "po_scope_comparison", "po_next_work_explanation", "po_portfolio_synthesis", "po_architecture_review",
  "coach_workout_explanation", "coach_session_reflection", "coach_kpi_interpretation", "coach_training_summary", "coach_hockey_iq_guidance", "coach_guarded_recommendation",
] as const;
export type IntelligenceTaskClass = (typeof intelligenceTaskClasses)[number];

/** PUBLIC may leave the app; INTERNAL is project-private; PRIVATE_ATHLETE contains athlete data; RESTRICTED is local-only unless policy explicitly changes. */
export const privacyClasses = ["PUBLIC", "INTERNAL", "PRIVATE_ATHLETE", "RESTRICTED"] as const;
export type PrivacyClass = (typeof privacyClasses)[number];

export const intelligenceTiers = ["TIER_0_DETERMINISTIC", "TIER_1_LOCAL", "TIER_2_HOSTED_LOW_COST", "TIER_3_FRONTIER"] as const;
export type IntelligenceTier = (typeof intelligenceTiers)[number];

export const capabilityNames = ["textGeneration", "toolCalling", "structuredOutput", "streaming", "reasoning", "vision", "embeddings"] as const;
export type CapabilityName = (typeof capabilityNames)[number];
export interface ModelCapabilities extends Record<CapabilityName, boolean> {
  maxContextTokens: number;
  localExecution: boolean;
  offlineCapable: boolean;
}

export interface LatencyBudget { maxLatencyMs: number | null }

export interface IntelligenceTaskRequest {
  taskId: string;
  taskClass: IntelligenceTaskClass;
  domain: "project_owner" | "coach_future";
  privacyClass: PrivacyClass;
  requiredCapabilities: CapabilityName[];
  preferredTier: IntelligenceTier;
  maxTier: IntelligenceTier;
  contextBudget: ContextBudget;
  latencyBudget: LatencyBudget;
  costBudget: CostBudget;
  evidencePacket: EvidencePacket;
  allowEscalation: boolean;
  inferenceRequirement: "none" | "allowed" | "required";
  deterministicPathAvailable: boolean;
  metadata: Readonly<Record<string, string | number | boolean | null>>;
}

export const routeRejectionReasons = [
  "privacy_not_allowed", "capability_missing", "not_task_approved", "unhealthy", "context_limit", "cost_limit",
  "tier_not_allowed", "local_unavailable", "latency_limit", "cost_unknown_under_hard_limit",
] as const;
export type RouteRejectionReason = (typeof routeRejectionReasons)[number];

export interface RouteCandidateReview {
  providerId: string;
  modelId: string;
  tier: IntelligenceTier;
  reasons: RouteRejectionReason[];
  estimatedCost: EstimatedCost;
}

export const escalationTriggers = ["provider_unavailable", "provider_timeout", "capability_mismatch", "quality_gate_failure", "context_overflow"] as const;
export type EscalationTrigger = (typeof escalationTriggers)[number];
export interface EscalationStep { providerId: string; modelId: string; tier: IntelligenceTier; permittedTriggers: EscalationTrigger[] }

export interface RouteDecision {
  selectedTier: IntelligenceTier | null;
  selectedProviderId?: string;
  selectedModelId?: string;
  decisionReason: string;
  consideredCandidates: RouteCandidateReview[];
  rejectedCandidates: RouteCandidateReview[];
  escalationPlan: EscalationStep[];
  deterministicNoModel: boolean;
  success: boolean;
  warnings: string[];
}

export interface IntelligenceProvenance {
  kind: "deterministic" | "model_generated";
  providerId: string | null;
  modelId: string | null;
  modelVersion: string | null;
  benchmarkVersion: string | null;
}

export interface IntelligenceResult {
  taskId: string;
  routeDecision: RouteDecision;
  providerId: string | null;
  modelId: string | null;
  output: string | null;
  structuredOutput?: unknown;
  usage: UsageRecord | null;
  estimatedCost: EstimatedCost;
  latencyMs: number | null;
  provenance: IntelligenceProvenance;
  escalationHistory: Array<{ trigger: EscalationTrigger; providerId: string; modelId: string; outcome: string }>;
  warnings: string[];
  errors: string[];
}

export interface IntelligenceTelemetry {
  taskId: string;
  taskClass: IntelligenceTaskClass;
  privacyClass: PrivacyClass;
  selectedTier: IntelligenceTier | null;
  selectedProviderId: string | null;
  selectedModelId: string | null;
  context: ContextBudgetResult["telemetry"];
  decisionReason: string;
  rejectedCandidates: Array<{ providerId: string; modelId: string; reasons: RouteRejectionReason[] }>;
  escalationPath: Array<{ providerId: string; modelId: string; tier: IntelligenceTier }>;
  usage: UsageRecord | null;
  estimatedCost: EstimatedCost;
  latencyMs: number | null;
  outcome: "planned" | "succeeded" | "failed" | "deterministic";
  benchmarkVersion: string | null;
  modelVersion: string | null;
}

export function assertIntelligenceTaskRequest(request: IntelligenceTaskRequest) {
  if (!privacyClasses.includes(request.privacyClass)) throw new Error(`Invalid privacy class: ${String(request.privacyClass)}`);
  if (!intelligenceTaskClasses.includes(request.taskClass)) throw new Error(`Invalid task class: ${String(request.taskClass)}`);
  if (!request.taskId.trim()) throw new Error("taskId is required.");
  if (!["none", "allowed", "required"].includes(request.inferenceRequirement)) throw new Error(`Invalid inference requirement: ${String(request.inferenceRequirement)}`);
  if (typeof request.deterministicPathAvailable !== "boolean") throw new Error("deterministicPathAvailable must be explicit.");
  if (request.costBudget.enforcement === "HARD" && request.costBudget.maxUsd === null) throw new Error("A HARD cost budget requires maxUsd.");
  if (request.domain === "coach_future" && !request.taskClass.startsWith("coach_")) throw new Error("Coach domain requires a coach task class.");
}
