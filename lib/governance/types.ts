export const scopePriorities = ["P0", "P1", "P2", "P3"] as const;
export type ScopePriority = (typeof scopePriorities)[number];

export const provenanceClasses = [
  "observed_fact",
  "deterministic_derived",
  "agent_assessment",
  "po_approved_decision",
] as const;
export type ProvenanceClass = (typeof provenanceClasses)[number];

export const confidenceLevels = ["high", "medium", "low", "not_scored"] as const;
export type Confidence = (typeof confidenceLevels)[number];

export const evidenceStates = ["canonical", "proposed", "approved", "not_scored", "missing_evidence"] as const;
export type EvidenceState = (typeof evidenceStates)[number];

export const approvalStates = ["not_required", "pending", "approved", "rejected", "overridden"] as const;
export type ApprovalState = (typeof approvalStates)[number];

export const scoreDimensions = [
  "business_user_value",
  "time_criticality",
  "risk_reduction_opportunity_enablement",
  "job_size_effort",
  "complexity",
  "data_readiness",
  "blast_radius",
  "technical_risk",
  "dependency_criticality",
  "evaluation_readiness",
] as const;
export type ScoreDimension = (typeof scoreDimensions)[number];

export const dependencyRelationshipTypes = [
  "blocks",
  "blocked_by",
  "requires",
  "required_by",
  "parent",
  "child",
  "supersedes",
  "superseded_by",
  "relates_to",
] as const;
export type DependencyRelationshipType = (typeof dependencyRelationshipTypes)[number];

export interface EvidenceRecord<T = unknown> {
  value: T;
  state: EvidenceState;
  provenance: ProvenanceClass;
  evidenceRefs: string[];
  rationale: string | null;
  confidence: Confidence;
  assessmentVersion: string | null;
  assessedAt: string | null;
  approvalState: ApprovalState;
  contradictions: string[];
  uncertainty: string[];
}

export interface PortfolioAssessment<T = unknown> extends EvidenceRecord<T> {
  dimension: string;
}

export interface PortfolioScore extends PortfolioAssessment<number | null> {
  dimension: ScoreDimension;
}

export interface SourceLocation {
  filePath: string;
  heading: string;
  recordFingerprint: string;
}

export interface ScopeItem {
  id: string;
  title: string | null;
  type: string | null;
  parent: string | null;
  priority: string | null;
  status: string | null;
  lane: string | null;
  owner: string | null;
  source: string | null;
  problem: string | null;
  desiredOutcome: string | null;
  inScope: string[];
  outOfScope: string[];
  acceptanceCriteria: string[];
  dependencies: string[];
  risks: string[];
  nextAction: string | null;
  linksEvidence: string[];
  scores: Partial<Record<ScoreDimension, PortfolioScore>>;
  sourceLocation: SourceLocation;
  missingFields: string[];
}

export interface PortfolioSnapshotMetadata {
  sourceFilePath: string;
  sourceGitSha: string;
  sourceContentHash: string;
  parsedAt: string | null;
}

export interface PortfolioReference {
  scopeId: string;
  source: "active_queue" | "priority_index";
  context: string;
}

export interface CanonicalPortfolio {
  metadata: PortfolioSnapshotMetadata;
  items: ScopeItem[];
  references: PortfolioReference[];
  dependencyEdges: DependencyEdge[];
}

export interface DependencyEdge {
  fromScopeId: string;
  toScopeId: string;
  relationshipType: DependencyRelationshipType;
  state: "canonical" | "proposed";
  provenance: ProvenanceClass;
  evidenceRefs: string[];
  confidence: Confidence;
}

export const mutationStates = ["proposed", "withdrawn", "approved_for_patch", "persisted"] as const;
export type MutationState = (typeof mutationStates)[number];

export interface GuardrailImpact {
  level: "none" | "review" | "block";
  ruleIds: string[];
  rationale: string | null;
}

export interface RecalculationImpact {
  facts: Array<"priority_distribution" | "status_distribution" | "wsjf" | "dependency_counts" | "dependency_cycles">;
  affectedScopeIds: string[];
}

export interface PortfolioMutation {
  mutationId: string;
  scopeId: string;
  fieldPath: string;
  canonicalValue: unknown;
  proposedValue: unknown;
  rationale: string | null;
  evidenceRefs: string[];
  confidence: Confidence;
  provenance: ProvenanceClass;
  actor: string;
  guardrailImpact: GuardrailImpact;
  recalculationImpact: RecalculationImpact;
  state: MutationState;
}

export interface ChangeLedgerEntry {
  mutation: PortfolioMutation;
  sequence: number;
}

export interface PortfolioDerivedFacts {
  priorityDistribution: Record<string, number>;
  statusDistribution: Record<string, number>;
  wsjf: Record<string, WsjfResult>;
  dependencyCounts: Record<string, { dependencies: number; dependents: number }>;
  dependencyCycles: string[][];
}

export interface WorkingPortfolio {
  canonical: CanonicalPortfolio;
  ledger: ChangeLedgerEntry[];
  effectiveItems: ScopeItem[];
  effectiveDependencyEdges: DependencyEdge[];
  diagnostics: ValidationDiagnostic[];
  derivedFacts: PortfolioDerivedFacts;
}

export interface ValidationDiagnostic {
  code: string;
  severity: "error" | "warning";
  message: string;
  scopeId?: string;
  fieldPath?: string;
}

export type WsjfInputName =
  | "business_user_value"
  | "time_criticality"
  | "risk_reduction_opportunity_enablement"
  | "job_size_effort";

export type WsjfResult =
  | { available: true; value: number; inputs: Record<WsjfInputName, number> }
  | { available: false; value: null; missingInputs: WsjfInputName[]; invalidInputs: WsjfInputName[] };
