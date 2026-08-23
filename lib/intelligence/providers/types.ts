import type { IntelligenceResult, IntelligenceTaskRequest, ModelCapabilities } from "../types";
import type { ProviderHealth } from "../registry";
import type { EstimatedCost, UsageRecord } from "../pricing/types";

export type ProviderAdapterKind = "OpenAIProvider" | "OpenAICompatibleProvider" | "BedrockProvider";
export type ProviderFailureClassification = "unavailable" | "timeout" | "capability_mismatch" | "context_overflow" | "quality_gate_failure" | "unknown";

export interface ProviderExecutionResult {
  providerId: string;
  modelId: string;
  output: string;
  structuredOutput?: unknown;
  usage: UsageRecord | null;
  estimatedCost: EstimatedCost;
  latencyMs: number | null;
  warnings: string[];
}

export interface ModelProvider {
  readonly providerId: string;
  readonly modelId: string;
  readonly adapterKind: ProviderAdapterKind;
  readonly capabilities: ModelCapabilities;
  readonly health: ProviderHealth;
  execute(request: IntelligenceTaskRequest): Promise<ProviderExecutionResult>;
}

export interface OpenAIProvider extends ModelProvider { readonly adapterKind: "OpenAIProvider" }
export interface OpenAICompatibleProvider extends ModelProvider { readonly adapterKind: "OpenAICompatibleProvider" }
export interface BedrockProvider extends ModelProvider { readonly adapterKind: "BedrockProvider" }

export interface ModelGateway {
  plan(request: IntelligenceTaskRequest): import("../types").RouteDecision;
  execute(request: IntelligenceTaskRequest): Promise<IntelligenceResult>;
}
