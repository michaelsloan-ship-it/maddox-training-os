import type { ContextBudgetResult } from "./context/budget";
import type { EstimatedCost, UsageRecord } from "./pricing/types";
import type { IntelligenceTaskRequest, IntelligenceTelemetry, RouteDecision } from "./types";

/** Produces metadata-only telemetry. Evidence content, secrets, endpoints, and arbitrary request metadata are intentionally excluded. */
export function createRouteTelemetry(request: IntelligenceTaskRequest, decision: RouteDecision, context: ContextBudgetResult, options: { usage?: UsageRecord | null; estimatedCost: EstimatedCost; latencyMs?: number | null; outcome?: IntelligenceTelemetry["outcome"]; benchmarkVersion?: string | null; modelVersion?: string | null }): IntelligenceTelemetry {
  return {
    taskId: request.taskId,
    taskClass: request.taskClass,
    privacyClass: request.privacyClass,
    selectedTier: decision.selectedTier,
    selectedProviderId: decision.selectedProviderId ?? null,
    selectedModelId: decision.selectedModelId ?? null,
    context: context.telemetry,
    decisionReason: decision.decisionReason,
    rejectedCandidates: decision.rejectedCandidates.map(({ providerId, modelId, reasons }) => ({ providerId, modelId, reasons })),
    escalationPath: decision.escalationPlan.map(({ providerId, modelId, tier }) => ({ providerId, modelId, tier })),
    usage: options.usage ?? null,
    estimatedCost: options.estimatedCost,
    latencyMs: options.latencyMs ?? null,
    outcome: options.outcome ?? "planned",
    benchmarkVersion: options.benchmarkVersion ?? null,
    modelVersion: options.modelVersion ?? null,
  };
}
