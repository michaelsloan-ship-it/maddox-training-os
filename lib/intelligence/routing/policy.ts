import { enforceContextBudget } from "../context/budget";
import { PricingCatalog, estimatePreCallCost } from "../pricing/catalog";
import { modelApprovalFor, type IntelligenceRegistrySnapshot, type ModelDescriptor, type ProviderDescriptor } from "../registry";
import { assertIntelligenceTaskRequest, intelligenceTiers, type IntelligenceTaskRequest, type IntelligenceTier, type RouteCandidateReview, type RouteDecision, type RouteRejectionReason } from "../types";

const modelTierOrder: Array<Exclude<IntelligenceTier, "TIER_0_DETERMINISTIC">> = ["TIER_1_LOCAL", "TIER_2_HOSTED_LOW_COST", "TIER_3_FRONTIER"];

export function planIntelligenceRoute(request: IntelligenceTaskRequest, registry: IntelligenceRegistrySnapshot): RouteDecision {
  assertIntelligenceTaskRequest(request);
  const deterministicRequired = request.inferenceRequirement === "none";
  const deterministicAllowedAndAvailable = request.inferenceRequirement === "allowed" && request.deterministicPathAvailable;
  if (deterministicRequired || deterministicAllowedAndAvailable) {
    return { selectedTier: "TIER_0_DETERMINISTIC", decisionReason: deterministicRequired ? "Caller explicitly requires a deterministic no-model route." : "Caller permits inference but explicitly supplied an eligible deterministic path.", consideredCandidates: [], rejectedCandidates: [], escalationPlan: [], deterministicNoModel: true, success: true, warnings: [] };
  }

  const context = enforceContextBudget(request.evidencePacket.items, request.contextBudget);
  const pricing = new PricingCatalog(registry.pricing);
  const providerById = new Map(registry.providers.map((provider) => [provider.providerId, provider]));
  const reviews = registry.models.map((model) => reviewCandidate(request, model, providerById.get(model.providerId), registry, context.packet.estimatedTokens, context.packet.budgetStatus === "REJECTED", pricing));
  const accepted = reviews.filter((review) => review.reasons.length === 0).sort((left, right) => candidateOrder(left, request.preferredTier) - candidateOrder(right, request.preferredTier) || left.providerId.localeCompare(right.providerId) || left.modelId.localeCompare(right.modelId));
  const rejected = reviews.filter((review) => review.reasons.length > 0);
  const selected = accepted[0];
  const warnings = accepted.flatMap((candidate) => {
    if (!candidate.estimatedCost.available) return [`${candidate.providerId}/${candidate.modelId}: pricing unavailable`];
    if (request.costBudget.enforcement === "SOFT" && request.costBudget.maxUsd !== null && candidate.estimatedCost.amountUsd! > request.costBudget.maxUsd) return [`${candidate.providerId}/${candidate.modelId}: estimated cost exceeds soft informational budget`];
    return [];
  });
  if (!selected) {
    return { selectedTier: null, decisionReason: "No eligible deterministic route exists for the supplied constraints.", consideredCandidates: [], rejectedCandidates: rejected, escalationPlan: [], deterministicNoModel: false, success: false, warnings };
  }
  return {
    selectedTier: selected.tier,
    selectedProviderId: selected.providerId,
    selectedModelId: selected.modelId,
    decisionReason: selected.tier === "TIER_1_LOCAL" ? "Approved healthy local candidate has first right of refusal and satisfies every hard constraint." : "Selected the first approved candidate that satisfies every hard constraint after local evaluation.",
    consideredCandidates: accepted,
    rejectedCandidates: rejected,
    escalationPlan: request.allowEscalation ? accepted.slice(1).map((candidate) => ({ providerId: candidate.providerId, modelId: candidate.modelId, tier: candidate.tier, permittedTriggers: ["provider_unavailable", "provider_timeout", "capability_mismatch", "quality_gate_failure", "context_overflow"] })) : [],
    deterministicNoModel: false,
    success: true,
    warnings,
  };
}

function reviewCandidate(request: IntelligenceTaskRequest, model: ModelDescriptor, provider: ProviderDescriptor | undefined, registry: IntelligenceRegistrySnapshot, evidenceTokens: number, contextRejected: boolean, pricingCatalog: PricingCatalog): RouteCandidateReview {
  const reasons: RouteRejectionReason[] = [];
  if (!provider || !provider.allowedPrivacyClasses.includes(request.privacyClass)) reasons.push("privacy_not_allowed");
  if (request.requiredCapabilities.some((capability) => !model.capabilities[capability])) reasons.push("capability_missing");
  if (modelApprovalFor(registry, request.taskClass, model.providerId, model.modelId)?.status !== "approved") reasons.push("not_task_approved");
  if (!provider || provider.health.state !== "HEALTHY") reasons.push("unhealthy");
  if (model.tier === "TIER_1_LOCAL" && (!registry.localAvailable || !provider?.local)) reasons.push("local_unavailable");
  if (tierIndex(model.tier) > tierIndex(request.maxTier)) reasons.push("tier_not_allowed");
  if (contextRejected || evidenceTokens + request.contextBudget.reserveOutputTokens > model.capabilities.maxContextTokens) reasons.push("context_limit");
  if (request.latencyBudget.maxLatencyMs !== null && provider?.health.latencyMs !== null && provider?.health.latencyMs !== undefined && provider.health.latencyMs > request.latencyBudget.maxLatencyMs) reasons.push("latency_limit");
  const estimatedCost = estimatePreCallCost(pricingCatalog.get(model.providerId, model.modelId), request.costBudget);
  if (request.costBudget.enforcement === "HARD" && !estimatedCost.available) reasons.push("cost_unknown_under_hard_limit");
  if (request.costBudget.enforcement === "HARD" && request.costBudget.maxUsd !== null && estimatedCost.available && estimatedCost.amountUsd! > request.costBudget.maxUsd) reasons.push("cost_limit");
  return { providerId: model.providerId, modelId: model.modelId, tier: model.tier, reasons: Array.from(new Set(reasons)), estimatedCost };
}

function tierIndex(tier: IntelligenceTier) { return intelligenceTiers.indexOf(tier); }
function candidateOrder(candidate: RouteCandidateReview, preferredTier: IntelligenceTier) {
  if (candidate.tier === "TIER_1_LOCAL") return 0;
  if (candidate.tier === preferredTier) return 1;
  return modelTierOrder.indexOf(candidate.tier as Exclude<IntelligenceTier, "TIER_0_DETERMINISTIC">) + 2;
}
