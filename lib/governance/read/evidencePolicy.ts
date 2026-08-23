export const evidenceAuthority = {
  canonical_detailed_record: 4,
  current_repository_evidence: 3,
  canonical_queue_or_index: 2,
  historical_checkpoint_narrative: 1,
} as const;

export type PortfolioEvidenceAuthority = keyof typeof evidenceAuthority;

export interface PortfolioStateEvidence<T = unknown> {
  value: T;
  authority: PortfolioEvidenceAuthority;
  evidenceRef: string;
  observedAt?: string | null;
}

export interface EvidenceResolution<T = unknown> {
  selected: PortfolioStateEvidence<T> | null;
  contradictions: PortfolioStateEvidence<T>[];
  missing: boolean;
  policy: string;
}

export function resolvePortfolioStateEvidence<T>(candidates: PortfolioStateEvidence<T>[]): EvidenceResolution<T> {
  if (!candidates.length) return { selected: null, contradictions: [], missing: true, policy: policyDescription };
  const ordered = [...candidates].sort((left, right) => {
    const authorityDifference = evidenceAuthority[right.authority] - evidenceAuthority[left.authority];
    if (authorityDifference) return authorityDifference;
    return (right.observedAt ?? "").localeCompare(left.observedAt ?? "");
  });
  const selected = ordered[0];
  return {
    selected,
    contradictions: ordered.slice(1).filter((candidate) => !sameValue(candidate.value, selected.value)),
    missing: false,
    policy: policyDescription,
  };
}

export const policyDescription = "Detailed canonical scope fields outrank queue/index and historical checkpoint prose. Current repository evidence may expose a contradiction; contradictions are reported, never silently merged.";

function sameValue(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}
