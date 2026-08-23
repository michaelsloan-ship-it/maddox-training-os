import { enforceContextBudget, type ContextBudgetResult, type EvidenceAuthority, type EvidenceItem, type IntelligenceTaskClass } from "@/lib/intelligence";

import type { NextWorkCandidate } from "../read/nextWorkCandidates";
import type { PortfolioReadService } from "../read/portfolioReadService";
import type { PoTaskClassification } from "./poTaskPolicy";

export interface PoEvidencePacketBuild {
  taskClass: IntelligenceTaskClass;
  context: ContextBudgetResult;
  legacyEstimatedTokens: number;
  mandatoryEvidenceRetained: boolean;
}

interface BuildOptions {
  classification: PoTaskClassification & { status: "supported"; taskClass: IntelligenceTaskClass };
  service: PortfolioReadService;
  canonicalSource: string;
  sourceRevision: string;
  budget: Parameters<typeof enforceContextBudget>[1];
}

export function buildPoEvidencePacket(options: BuildOptions): PoEvidencePacketBuild {
  const { classification, service } = options;
  const built = evidenceForTask(classification.taskClass, classification.scopeIds, service, options.canonicalSource, options.sourceRevision);
  const context = enforceContextBudget(built.items, options.budget);
  return {
    taskClass: classification.taskClass,
    context,
    legacyEstimatedTokens: estimateTokens(built.legacyEquivalent),
    mandatoryEvidenceRetained: context.packet.budgetStatus !== "REJECTED" && !context.packet.omittedItems.some((item) => item.required),
  };
}

function evidenceForTask(taskClass: IntelligenceTaskClass, scopeIds: string[], service: PortfolioReadService, canonicalSource: string, sourceRevision: string) {
  const provenance = { canonicalSource, sourceRevision, evidenceType: "deterministic_read_service" };
  if (taskClass === "po_next_work_explanation") {
    const candidates = service.getNextWorkCandidates();
    const recommended = candidates.executableCandidates[0] ?? null;
    const strongestExecutableAlternative = candidates.executableCandidates[1] ?? null;
    const relevantReconciliation = candidates.reconciliationCandidates.slice(0, 2);
    const relevantReview = candidates.reviewCandidates.slice(0, 3);
    const included = [recommended, strongestExecutableAlternative, ...relevantReconciliation, ...relevantReview].filter((candidate): candidate is NextWorkCandidate => Boolean(candidate));
    const missingEvidence = Object.fromEntries(included.map((candidate) => [candidate.scopeId, service.getMissingEvidence({ scopeId: candidate.scopeId })]));
    return {
      legacyEquivalent: candidates,
      items: [
        item("provenance", "REQUIRED", true, provenance),
        item("next-work-recommendation", "REQUIRED", true, { candidate: projectCandidate(recommended), selection: "first executable candidate from deterministic ranking" }),
        item("next-work-strongest-executable-alternative", "REQUIRED", true, { available: Boolean(strongestExecutableAlternative), candidate: projectCandidate(strongestExecutableAlternative) }),
        item("next-work-relevant-reconciliation", "CANONICAL", relevantReconciliation.length > 0, { materiallyApplicable: relevantReconciliation.length > 0, candidates: relevantReconciliation.map(projectCandidate) }),
        item("next-work-relevant-review", "CANONICAL", relevantReview.length > 0, { materiallyApplicable: relevantReview.length > 0, candidates: relevantReview.map(projectCandidate) }),
        item("next-work-ranking-policy", "REQUIRED", true, candidates.rankingPolicy),
        item("next-work-missing-evidence", "REQUIRED", true, missingEvidence),
      ],
    };
  }

  if (taskClass === "po_scope_explanation") {
    const scopeId = scopeIds[0];
    const record = service.getScopeItem({ scopeId });
    const dependencies = service.getScopeDependencies({ scopeId });
    const missing = service.getMissingEvidence({ scopeId });
    return { legacyEquivalent: { record, dependencies, missing }, items: [item("provenance", "REQUIRED", true, provenance), item(`scope:${scopeId}`, "REQUIRED", true, projectScopeRecord(record)), item(`dependencies:${scopeId}`, "CANONICAL", true, dependencies), item(`missing:${scopeId}`, "CANONICAL", true, missing)] };
  }

  if (taskClass === "po_scope_comparison") {
    const comparison = service.compareScopeItems({ scopeIds });
    const details = scopeIds.map((scopeId) => ({ scopeId, record: projectScopeRecord(service.getScopeItem({ scopeId })), dependencies: service.getScopeDependencies({ scopeId }), missing: service.getMissingEvidence({ scopeId }) }));
    return { legacyEquivalent: { comparison, details }, items: [item("provenance", "REQUIRED", true, provenance), item("comparison", "REQUIRED", true, comparison), ...details.map((detail) => item(`comparison-detail:${detail.scopeId}`, "CANONICAL", true, detail))] };
  }

  if (taskClass === "po_portfolio_synthesis") {
    const summary = service.getPortfolioSummary();
    const candidates = service.getNextWorkCandidates();
    const examples = {
      executable: candidates.executableCandidates.slice(0, 3).map(projectCandidate),
      review: candidates.reviewCandidates.slice(0, 3).map(projectCandidate),
      reconciliation: candidates.reconciliationCandidates.slice(0, 3).map(projectCandidate),
      counts: { executable: candidates.executableCandidates.length, review: candidates.reviewCandidates.length, reconciliation: candidates.reconciliationCandidates.length, excluded: candidates.excludedCandidates.length },
    };
    return { legacyEquivalent: { summary, candidates }, items: [item("provenance", "REQUIRED", true, provenance), item("portfolio-summary", "REQUIRED", true, summary), item("portfolio-bounded-examples", "CANONICAL", true, examples), item("portfolio-ranking-policy", "SUPPORTING", false, candidates.rankingPolicy)] };
  }

  if (taskClass === "po_architecture_review") {
    const scopeId = scopeIds[0];
    const record = service.getScopeItem({ scopeId });
    const dependencies = service.getScopeDependencies({ scopeId });
    const architectureRecord = record.found ? {
      id: record.item.id, title: record.item.title, status: record.item.status, inScope: record.item.inScope,
      outOfScope: record.item.outOfScope, acceptanceCriteria: record.item.acceptanceCriteria,
      dependencies: record.item.dependencies, risks: record.item.risks, nextAction: record.item.nextAction,
      sequencingEvidence: record.sequencingEvidence, contradictions: record.contradictions,
    } : record;
    return { legacyEquivalent: { record, dependencies }, items: [item("provenance", "REQUIRED", true, provenance), item(`architecture:${scopeId}`, "REQUIRED", true, architectureRecord), item(`architecture-dependencies:${scopeId}`, "CANONICAL", true, dependencies)] };
  }

  throw new Error(`Unsupported PO evidence task: ${taskClass}`);
}

function projectCandidate(candidate: NextWorkCandidate | null) {
  if (!candidate) return null;
  return {
    scopeId: candidate.scopeId, title: candidate.title, priority: candidate.priority, status: candidate.status,
    lifecycleEligibility: candidate.lifecycleEligibility, readinessCategory: candidate.readinessCategory,
    sequencingEvidence: candidate.sequencingEvidence, prerequisiteState: candidate.prerequisiteState,
    blockingState: candidate.blockingState, contradictionList: candidate.contradictionList,
    rankInputs: candidate.rankInputs, reconciliationRequired: candidate.reconciliationRequired,
    evidenceRefs: candidate.evidenceRefs,
  };
}

function projectScopeRecord(record: ReturnType<PortfolioReadService["getScopeItem"]>) {
  if (!record.found) return record;
  return {
    found: true, authority: record.authority,
    item: {
      id: record.item.id, title: record.item.title, type: record.item.type, parent: record.item.parent,
      priority: record.item.priority, status: record.item.status, lane: record.item.lane,
      problem: record.item.problem, desiredOutcome: record.item.desiredOutcome, nextAction: record.item.nextAction,
    },
    sequencingEvidence: record.sequencingEvidence, contradictions: record.contradictions,
    evidenceResolution: record.evidenceResolution,
  };
}

function item(id: string, authority: EvidenceAuthority, required: boolean, content: unknown): EvidenceItem {
  return { id, authority, required, content, estimatedTokens: estimateTokens(content) };
}

export function estimateTokens(content: unknown) {
  return Math.ceil(JSON.stringify(content).length / 4);
}
