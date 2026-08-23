import type { IntelligenceTaskClass, PrivacyClass } from "../types";

export interface BenchmarkExpectation { requiredFacts: string[]; forbiddenClaims: string[]; structuredSchemaId: string | null; expectedToolNames: string[] }
export interface BenchmarkCase { caseId: string; taskClass: IntelligenceTaskClass; privacyClass: PrivacyClass; inputFixtureRef: string; expectation: BenchmarkExpectation }
export interface BenchmarkRun { runId: string; benchmarkVersion: string; providerId: string; modelId: string; startedAt: string; caseIds: string[] }
export interface BenchmarkResult {
  caseId: string;
  correctness: number | null;
  grounding: number | null;
  structuredValidity: number | null;
  toolSelection: number | null;
  hallucination: number | null;
  adherence: number | null;
  latencyMs: number | null;
  estimatedCostUsd: number | null;
  localMemoryMb: number | null;
  tokensPerSecond: number | null;
  fallbackOccurred: boolean;
}
export interface ModelTaskScore { taskClass: IntelligenceTaskClass; providerId: string; modelId: string; benchmarkVersion: string; results: BenchmarkResult[]; approvalRecommendation: "experimental" | "approved" | "disallowed" | "insufficient_evidence" }
