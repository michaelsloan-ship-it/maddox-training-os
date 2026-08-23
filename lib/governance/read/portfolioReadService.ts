import { createWorkingPortfolio } from "../working";
import { directDependencies, directDependents, transitiveDependencies, transitiveDependents } from "../dependencies";
import { scoreDimensions, type CanonicalPortfolio, type ScopeItem, type ValidationDiagnostic } from "../types";
import { policyDescription, resolvePortfolioStateEvidence, type PortfolioStateEvidence } from "./evidencePolicy";
import { getNextWorkCandidates } from "./nextWorkCandidates";

export interface PortfolioReadContext {
  portfolio: CanonicalPortfolio;
  diagnostics: ValidationDiagnostic[];
}

export function createPortfolioReadService(context: PortfolioReadContext) {
  const { portfolio, diagnostics } = context;
  const working = createWorkingPortfolio(portfolio);
  const byId = new Map(portfolio.items.map((item) => [item.id, item]));

  return {
    getPortfolioSummary() {
      return {
        source: portfolio.metadata,
        itemCount: portfolio.items.length,
        diagnosticCount: diagnostics.length,
        diagnosticsBySeverity: countBy(diagnostics, (diagnostic) => diagnostic.severity),
        priorityDistribution: working.derivedFacts.priorityDistribution,
        statusDistribution: working.derivedFacts.statusDistribution,
        authorityPolicy: policyDescription,
      };
    },
    getScopeItem({ scopeId }: { scopeId: string }) {
      const item = byId.get(scopeId);
      if (!item) return { found: false as const, scopeId };
      const statusEvidence: PortfolioStateEvidence<string>[] = [
        { value: item.status ?? "missing", authority: "canonical_detailed_record", evidenceRef: `${item.sourceLocation.heading}.Status` },
        ...portfolio.sequencingEvidence.filter((entry) => entry.referencedScopeIds.includes(scopeId) && entry.status).map((entry) => ({
          value: entry.status!, authority: entry.authority, evidenceRef: `${entry.sourceSection}: ${entry.context}`,
        })),
      ];
      const statusResolution = resolvePortfolioStateEvidence(statusEvidence);
      const candidate = getNextWorkCandidates(portfolio);
      const decisionSupport = [...candidate.executableCandidates, ...candidate.reviewCandidates, ...candidate.reconciliationCandidates, ...candidate.excludedCandidates].find((entry) => entry.scopeId === scopeId);
      return {
        found: true as const,
        item,
        authority: "canonical_detailed_record" as const,
        sequencingEvidence: portfolio.sequencingEvidence.filter((entry) => entry.referencedScopeIds.includes(scopeId)),
        contradictions: Array.from(new Set([...(statusResolution.contradictions.map((entry) => `${entry.evidenceRef} says ${entry.value}; detailed record says ${item.status}.`)), ...(decisionSupport?.contradictionList ?? [])])),
        evidenceResolution: { status: statusResolution },
      };
    },
    searchScope({ query }: { query: string }) {
      const normalized = query.trim().toLowerCase();
      if (!normalized) return [];
      return portfolio.items.filter((item) => searchableText(item).includes(normalized)).map(compactItem);
    },
    getScopeDiagnostics() {
      return { count: diagnostics.length, diagnostics };
    },
    getScopeDependencies({ scopeId }: { scopeId: string }) {
      const item = byId.get(scopeId);
      if (!item) return { found: false as const, scopeId };
      return {
        found: true as const,
        scopeId,
        declaredDependencyEvidence: item.dependencies,
        directDependencies: directDependencies(scopeId, portfolio.dependencyEdges),
        directDependents: directDependents(scopeId, portfolio.dependencyEdges),
        transitiveDependencies: transitiveDependencies(scopeId, portfolio.dependencyEdges),
        transitiveDependents: transitiveDependents(scopeId, portfolio.dependencyEdges),
        note: portfolio.dependencyEdges.length ? null : "No structured dependency edges are present; prose dependencies are evidence, not inferred graph edges.",
      };
    },
    getPriorityDistribution() {
      return working.derivedFacts.priorityDistribution;
    },
    getStatusDistribution() {
      return working.derivedFacts.statusDistribution;
    },
    getScopeWsjf({ scopeId }: { scopeId: string }) {
      const item = byId.get(scopeId);
      if (!item) return { found: false as const, scopeId };
      return { found: true as const, scopeId, result: working.derivedFacts.wsjf[scopeId], scores: item.scores };
    },
    getMissingEvidence({ scopeId }: { scopeId: string }) {
      const item = byId.get(scopeId);
      if (!item) return { found: false as const, scopeId };
      const missingScoreEvidence = scoreDimensions.filter((dimension) => !item.scores[dimension] || item.scores[dimension]?.state === "not_scored" || item.scores[dimension]?.state === "missing_evidence");
      return {
        found: true as const,
        scopeId,
        missingFields: item.missingFields,
        missingScoreEvidence,
        notScored: missingScoreEvidence.length > 0,
        resolution: "Gather cited evidence for each missing dimension; do not assign defaults.",
      };
    },
    compareScopeItems({ scopeIds }: { scopeIds: string[] }) {
      const uniqueIds = Array.from(new Set(scopeIds));
      return {
        items: uniqueIds.map((scopeId) => {
          const item = byId.get(scopeId);
          return item ? { ...compactItem(item), wsjf: working.derivedFacts.wsjf[scopeId], missingEvidence: scoreDimensions.filter((dimension) => !item.scores[dimension]) } : { id: scopeId, found: false as const };
        }),
        canonicalUnchanged: true,
      };
    },
    getNextWorkCandidates() {
      return getNextWorkCandidates(portfolio);
    },
  };
}

export type PortfolioReadService = ReturnType<typeof createPortfolioReadService>;

function compactItem(item: ScopeItem) {
  return { id: item.id, found: true as const, title: item.title, priority: item.priority, status: item.status, lane: item.lane, problem: item.problem, desiredOutcome: item.desiredOutcome, nextAction: item.nextAction };
}

function searchableText(item: ScopeItem) {
  return [item.id, item.title, item.type, item.parent, item.priority, item.status, item.lane, item.owner, item.problem, item.desiredOutcome, item.nextAction, ...item.inScope, ...item.outOfScope, ...item.acceptanceCriteria, ...item.dependencies, ...item.risks].filter(Boolean).join(" ").toLowerCase();
}

function countBy<T>(items: T[], key: (item: T) => string) {
  const result: Record<string, number> = {};
  for (const item of items) result[key(item)] = (result[key(item)] ?? 0) + 1;
  return result;
}
