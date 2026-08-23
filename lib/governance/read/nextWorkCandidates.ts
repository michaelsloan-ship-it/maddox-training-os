import type { CanonicalPortfolio, ScopeItem, SequencingEvidence } from "../types";

export const lifecycleEligibilities = [
  "ELIGIBLE_EXECUTION", "ELIGIBLE_REVIEW", "BLOCKED", "DEFERRED", "COMPLETED", "HISTORICAL",
  "SUPERSEDED", "OBSOLETE_OR_CONTRADICTED", "RECONCILIATION_REQUIRED",
] as const;
export type LifecycleEligibility = (typeof lifecycleEligibilities)[number];

export interface NextWorkCandidate {
  scopeId: string;
  title: string | null;
  priority: string | null;
  status: string | null;
  lifecycleEligibility: LifecycleEligibility;
  readinessCategory: "executable" | "review" | "reconciliation" | "excluded";
  sequencingEvidence: SequencingEvidence[];
  prerequisiteState: { declared: string[]; completedScopeIds: string[]; unresolvedScopeIds: string[]; unknownEvidence: string[] };
  blockingState: { blocked: boolean; reasons: string[] };
  contradictionList: string[];
  exclusionReasons: string[];
  rankInputs: {
    currentSprintSequence: number | null;
    queueOrder: number | null;
    lifecycleReadiness: number;
    priorityOrder: number | null;
    hasExplicitNextAction: boolean;
    dependencyCriticality: number | null;
    wsjf: null;
  };
  reconciliationRequired: boolean;
  evidenceRefs: string[];
}

export interface NextWorkCandidateResult {
  executableCandidates: NextWorkCandidate[];
  reviewCandidates: NextWorkCandidate[];
  reconciliationCandidates: NextWorkCandidate[];
  excludedCandidates: NextWorkCandidate[];
  rankingPolicy: string[];
  canonicalUnchanged: true;
}

const completedStatuses = new Set(["completed", "completed locally", "ci verified / production pending"]);
const priorityOrder: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

export function getNextWorkCandidates(portfolio: CanonicalPortfolio): NextWorkCandidateResult {
  const byId = new Map(portfolio.items.map((item) => [item.id, item]));
  const candidates = portfolio.items.map((item) => buildCandidate(item, portfolio.sequencingEvidence, byId));
  const sorted = (values: NextWorkCandidate[]) => [...values].sort(compareCandidates);
  return {
    executableCandidates: sorted(candidates.filter((candidate) => candidate.readinessCategory === "executable")),
    reviewCandidates: sorted(candidates.filter((candidate) => candidate.readinessCategory === "review")),
    reconciliationCandidates: sorted(candidates.filter((candidate) => candidate.readinessCategory === "reconciliation")),
    excludedCandidates: sorted(candidates.filter((candidate) => candidate.readinessCategory === "excluded")),
    rankingPolicy: [
      "Explicit Current Sprint / Next Codex Task order first.",
      "Executable lifecycle readiness before review-only work.",
      "P0 then P1 then P2 then P3 when lifecycle evidence is equally actionable.",
      "Active Execution Queue order next, followed by an explicit next action and stable scope ID.",
      "WSJF is omitted unless all required canonical inputs exist; no AI priority score is created.",
    ],
    canonicalUnchanged: true,
  };
}

function buildCandidate(item: ScopeItem, allEvidence: SequencingEvidence[], byId: Map<string, ScopeItem>): NextWorkCandidate {
  const sequencingEvidence = allEvidence.filter((evidence) => evidence.referencedScopeIds.includes(item.id));
  const contradictions = findContradictions(item, sequencingEvidence);
  const prerequisites = resolvePrerequisites(item, byId);
  const blockingReasons = item.status?.toLowerCase() === "blocked" ? [item.nextAction || item.dependencies.join("; ") || "Detailed record status is Blocked without a stated resolution."] : [];
  if (prerequisites.unresolvedScopeIds.length) blockingReasons.push(`Unresolved prerequisite scope IDs: ${prerequisites.unresolvedScopeIds.join(", ")}`);
  const lifecycleEligibility = classifyLifecycle(item, contradictions, blockingReasons);
  const reconciliationRequired = lifecycleEligibility === "RECONCILIATION_REQUIRED" || lifecycleEligibility === "OBSOLETE_OR_CONTRADICTED";
  const readinessCategory = lifecycleEligibility === "ELIGIBLE_EXECUTION" ? "executable"
    : lifecycleEligibility === "ELIGIBLE_REVIEW" ? "review"
      : reconciliationRequired ? "reconciliation" : "excluded";
  const exclusionReasons = readinessCategory === "excluded" ? exclusionReason(lifecycleEligibility, blockingReasons) : [];
  const sprintIndexes = allEvidence.map((evidence, index) => evidence.sourceSection === "current_sprint_next_task" && evidence.referencedScopeIds.includes(item.id) ? index + 1 : null);
  const queueOrder = minNullable(sequencingEvidence.map((evidence) => evidence.queueOrder));
  return {
    scopeId: item.id,
    title: item.title,
    priority: item.priority,
    status: item.status,
    lifecycleEligibility,
    readinessCategory,
    sequencingEvidence: sequencingEvidence.map((evidence) => ({ ...evidence, contradictionMarkers: contradictions.filter((entry) => entry.includes(evidence.sourceSection)) })),
    prerequisiteState: prerequisites,
    blockingState: { blocked: blockingReasons.length > 0, reasons: blockingReasons },
    contradictionList: contradictions,
    exclusionReasons,
    rankInputs: {
      currentSprintSequence: minNullable(sprintIndexes),
      queueOrder,
      lifecycleReadiness: lifecycleEligibility === "ELIGIBLE_EXECUTION" ? 0 : lifecycleEligibility === "ELIGIBLE_REVIEW" ? 1 : 2,
      priorityOrder: item.priority ? priorityOrder[item.priority] ?? null : null,
      hasExplicitNextAction: Boolean(item.nextAction?.trim()),
      dependencyCriticality: null,
      wsjf: null,
    },
    reconciliationRequired,
    evidenceRefs: [
      `${item.sourceLocation.filePath}#${item.sourceLocation.heading}`,
      ...sequencingEvidence.map((evidence) => `${item.sourceLocation.filePath}#${evidence.sourceSection}`),
    ],
  };
}

function classifyLifecycle(item: ScopeItem, contradictions: string[], blockingReasons: string[]): LifecycleEligibility {
  const status = item.status?.trim().toLowerCase() ?? "";
  const text = [item.title, item.problem, item.nextAction, ...item.outOfScope, ...item.linksEvidence].filter(Boolean).join(" ").toLowerCase();
  if (status === "completed" || status === "completed locally" || status === "ci verified / production pending") return contradictions.length ? "RECONCILIATION_REQUIRED" : "COMPLETED";
  if (status === "deferred") return "DEFERRED";
  if (status === "historical") return "HISTORICAL";
  if (status.includes("superseded") || /superseded by/.test(text)) return "SUPERSEDED";
  if (/\bobsolete\b/.test(text)) return "OBSOLETE_OR_CONTRADICTED";
  if (contradictions.length) return "RECONCILIATION_REQUIRED";
  if (status === "blocked" || blockingReasons.length) return "BLOCKED";
  if (status === "scope review required") return "ELIGIBLE_REVIEW";
  if (["in progress", "not started", "reopened / product qa found incomplete rendering-path coverage"].includes(status)) return "ELIGIBLE_EXECUTION";
  return "RECONCILIATION_REQUIRED";
}

function findContradictions(item: ScopeItem, evidence: SequencingEvidence[]) {
  const contradictions: string[] = [];
  for (const entry of evidence) {
    if (entry.status && item.status && normalize(entry.status) !== normalize(item.status)) {
      contradictions.push(`Detailed status says ${item.status}; ${entry.sourceSection} says ${entry.status}.`);
    }
    const context = entry.context.toLowerCase();
    if (item.status?.toLowerCase() === "scope review required" && /\b(?:is |are |was |were )?(?:complete|completed|resolved|fixed|verified|live)\b/.test(context)) {
      contradictions.push(`Detailed status says Scope review required; ${entry.sourceSection} reports completion evidence: ${entry.context}`);
    }
  }
  return Array.from(new Set(contradictions));
}

function resolvePrerequisites(item: ScopeItem, byId: Map<string, ScopeItem>) {
  const referencedIds = Array.from(new Set(item.dependencies.flatMap((dependency) => dependency.match(/[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+/g) ?? [])));
  const completedScopeIds: string[] = [];
  const unresolvedScopeIds: string[] = [];
  for (const id of referencedIds) {
    const dependency = byId.get(id);
    if (dependency && completedStatuses.has(normalize(dependency.status))) completedScopeIds.push(id);
    else unresolvedScopeIds.push(id);
  }
  const unknownEvidence = item.dependencies.filter((dependency) => !(dependency.match(/[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+/g) ?? []).length);
  return { declared: item.dependencies, completedScopeIds, unresolvedScopeIds, unknownEvidence };
}

function compareCandidates(left: NextWorkCandidate, right: NextWorkCandidate) {
  const tuple = (candidate: NextWorkCandidate) => [
    candidate.rankInputs.currentSprintSequence ?? Number.MAX_SAFE_INTEGER,
    candidate.rankInputs.lifecycleReadiness,
    candidate.rankInputs.priorityOrder ?? Number.MAX_SAFE_INTEGER,
    candidate.rankInputs.queueOrder ?? Number.MAX_SAFE_INTEGER,
    candidate.rankInputs.hasExplicitNextAction ? 0 : 1,
  ];
  const leftTuple = tuple(left);
  const rightTuple = tuple(right);
  for (let index = 0; index < leftTuple.length; index += 1) if (leftTuple[index] !== rightTuple[index]) return leftTuple[index] - rightTuple[index];
  return left.scopeId.localeCompare(right.scopeId);
}

function exclusionReason(eligibility: LifecycleEligibility, blockers: string[]) {
  if (eligibility === "BLOCKED") return blockers;
  return [`Lifecycle eligibility ${eligibility} is not actionable as next executable work.`];
}

function normalize(value: string | null) { return value?.trim().toLowerCase() ?? ""; }
function minNullable(values: Array<number | null>) {
  const present = values.filter((value): value is number => value !== null);
  return present.length ? Math.min(...present) : null;
}
