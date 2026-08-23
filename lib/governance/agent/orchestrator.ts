import { Agent, run } from "@openai/agents";

import { evaluateReadOnlyRequest } from "./readOnlyPolicy";
import { createAgentReadTools } from "./readToolRegistry";
import { createPortfolioReadService } from "../read/portfolioReadService";
import { loadCanonicalPortfolio, type LoadedCanonicalPortfolio } from "../server/portfolioLoader";
import { buildUsageMetadata, type PoAgentUsageMetadata } from "./usageMetadata";
import { buildPoEvidencePacket, type PoEvidencePacketBuild } from "./poEvidencePacketBuilder";
import { getPoContextBudget, getPoContextMode, type PoContextMode } from "./poEvidencePolicy";
import { classifyPoTask, type PoTaskClassificationStatus } from "./poTaskPolicy";

export interface PoContextTelemetry {
  configuredMode: PoContextMode;
  mode: PoContextMode;
  taskClass: string | null;
  classificationStatus: PoTaskClassificationStatus;
  fallbackReason: string | null;
  baselineInputTokens: number | null;
  rawEvidenceItemCount: number | null;
  rawEstimatedTokens: number | null;
  legacyEquivalentEstimatedTokens: number | null;
  packedEvidenceItemCount: number | null;
  packedEstimatedTokens: number | null;
  omittedEvidenceCount: number | null;
  mandatoryEvidenceRetained: boolean | null;
  budgetStatus: "FIT" | "TRUNCATED" | "REJECTED" | null;
  estimatedReductionPercent: number | null;
  actualInputTokens: number | null;
  aggregateRunInputTokens: number | null;
  aggregateRunOutputTokens: number | null;
  modelRequestCount: number | null;
  perRequestUsage: Array<{ inputTokens: number; outputTokens: number }> | null;
  toolCallCount: number | null;
}

export interface PoAgentResponse {
  answer: string;
  readOnly: true;
  canonicalSource: string;
  sourceRevision: string;
  diagnosticCount: number;
  usage: PoAgentUsageMetadata;
  contextTelemetry?: PoContextTelemetry;
}

export interface PoAgentConfiguration {
  apiConfigured: boolean;
  configured: boolean;
  environment: "local/development" | "preview" | "production";
  explicitlyEnabled: boolean;
  model: string;
  modelSupported: boolean;
}

export const DEFAULT_PO_AGENT_MODEL = "gpt-5.6-sol";
export const SUPPORTED_PO_AGENT_MODELS = ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"] as const;

export function getPoAgentConfiguration(environment: Record<string, string | undefined> = process.env): PoAgentConfiguration {
  const deploymentEnvironment = classifyPoAgentEnvironment(environment);
  const explicitlyEnabled = environment.PO_AGENT_ENABLED === "true";
  const apiConfigured = Boolean(environment.OPENAI_API_KEY);
  const model = environment.PO_AGENT_MODEL?.trim() || DEFAULT_PO_AGENT_MODEL;
  const modelSupported = SUPPORTED_PO_AGENT_MODELS.includes(model as (typeof SUPPORTED_PO_AGENT_MODELS)[number]);
  const environmentAllowsExecution = deploymentEnvironment === "local/development" || explicitlyEnabled;
  return {
    apiConfigured,
    configured: apiConfigured && environmentAllowsExecution && modelSupported,
    environment: deploymentEnvironment,
    explicitlyEnabled,
    model,
    modelSupported,
  };
}

export function classifyPoAgentEnvironment(environment: Record<string, string | undefined>): PoAgentConfiguration["environment"] {
  if (environment.VERCEL_ENV === "production") return "production";
  if (environment.VERCEL_ENV === "preview") return "preview";
  if (environment.NODE_ENV === "production") return "production";
  return "local/development";
}

export function assertPoAgentExecutionAllowed(environment: Record<string, string | undefined> = process.env): PoAgentConfiguration {
  const configuration = getPoAgentConfiguration(environment);
  if (configuration.environment !== "local/development" && !configuration.explicitlyEnabled) {
    throw new PoAgentConfigurationError("PO Agent is unavailable in this environment because server-side enablement is not explicit.");
  }
  if (!configuration.apiConfigured) throw new PoAgentConfigurationError("PO Agent is not configured on the server.");
  if (!configuration.modelSupported) throw new PoAgentConfigurationError(`PO Agent model configuration is unsupported: ${configuration.model}`);
  return configuration;
}

export async function runReadOnlyPoAgent(question: string): Promise<PoAgentResponse> {
  return runReadOnlyPoAgentWithRuntime(question);
}

interface AgentUsageLike {
  requests?: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  inputTokensDetails?: Array<Record<string, number>>;
  requestUsageEntries?: Array<{ inputTokens?: number; outputTokens?: number }>;
}

interface AgentRunResultLike { finalOutput: unknown; state: { usage: AgentUsageLike }; newItems?: Array<{ type?: string }> }
type PoModelRunner = (agent: Agent, input: string, options: { maxTurns: number }) => Promise<AgentRunResultLike>;

interface PoAgentRuntimeOptions {
  environment?: Record<string, string | undefined>;
  loaded?: LoadedCanonicalPortfolio;
  runner?: PoModelRunner;
}

export async function runReadOnlyPoAgentWithRuntime(question: string, options: PoAgentRuntimeOptions = {}): Promise<PoAgentResponse> {
  const environment = options.environment ?? process.env;
  const configuration = assertPoAgentExecutionAllowed(environment);
  const loaded = options.loaded ?? await loadCanonicalPortfolio();
  const service = createPortfolioReadService(loaded);
  const requestPolicy = evaluateReadOnlyRequest(question);
  const configuredMode = getPoContextMode(environment);
  const classification = classifyPoTask(question);
  const packedEnvironmentAllowed = configuration.environment === "local/development" || environment.PO_AGENT_PACKED_ENABLED === "true";
  let packetBuild: PoEvidencePacketBuild | null = null;
  if ((configuredMode === "shadow" || (configuredMode === "packed" && packedEnvironmentAllowed)) && classification.status === "supported" && classification.taskClass) {
    packetBuild = buildPoEvidencePacket({
      classification: { ...classification, status: "supported", taskClass: classification.taskClass }, service,
      canonicalSource: loaded.portfolio.metadata.sourceFilePath, sourceRevision: loaded.sourceRevision,
      budget: getPoContextBudget(classification.taskClass, environment),
    });
  }
  const packedEligible = configuredMode === "packed" && packedEnvironmentAllowed && packetBuild !== null && packetBuild.context.packet.budgetStatus !== "REJECTED" && packetBuild.mandatoryEvidenceRetained;
  const effectiveMode: PoContextMode = packedEligible ? "packed" : configuredMode === "shadow" ? "shadow" : "legacy";
  const fallbackReason = configuredMode === "packed" && !packedEligible
    ? !packedEnvironmentAllowed ? "packed_not_enabled_for_environment"
      : classification.status !== "supported" ? `Packed mode fell back to legacy: ${classification.reason}`
      : packetBuild?.context.packet.budgetStatus === "REJECTED" ? `Packed mode fell back to legacy: ${packetBuild.context.reasons.join(" ")}`
        : "Packed mode fell back to legacy because mandatory evidence retention was not proven."
    : null;
  const agent = new Agent({
    name: "Maddox Training OS Project Owner Analyst",
    model: configuration.model,
    instructions: packedEligible ? packedPoAgentInstructions : poAgentInstructions,
    tools: packedEligible ? [] : createAgentReadTools(service),
  });
  const legacyInput = requestPolicy.notice ? `${question}\n\nDeterministic read-only policy notice: ${requestPolicy.notice}` : question;
  const input = packedEligible ? `${legacyInput}\n\nEvidence authority: The supplied EvidencePacket is authoritative for this request. Canonical facts must come from it. Omitted or unsupported evidence must be reported as insufficient, never invented. Ground the explanation only in its scope, priority/status, lifecycle, blockers/prerequisites, dependencies, contradictions, missing evidence, sequencing, and provenance.\n\nEvidencePacket (appears once):\n${JSON.stringify(packetBuild!.context.packet)}` : legacyInput;
  const runner: PoModelRunner = options.runner ?? (async (selectedAgent, selectedInput, runOptions) => run(selectedAgent, selectedInput, runOptions) as unknown as Promise<AgentRunResultLike>);
  const result = await runner(agent, input, { maxTurns: 10 });
  const answer = result.finalOutput;
  if (typeof answer !== "string" || !answer.trim()) throw new Error("PO Agent returned no response.");
  const usage = buildUsageMetadata(configuration.model, result.state.usage);
  return {
    answer,
    readOnly: true,
    canonicalSource: loaded.portfolio.metadata.sourceFilePath,
    sourceRevision: loaded.sourceRevision,
    diagnosticCount: loaded.diagnostics.length,
    usage,
    contextTelemetry: buildContextTelemetry({ configuredMode, effectiveMode, classificationStatus: classification.status, taskClass: classification.taskClass, fallbackReason, packetBuild, usage: result.state.usage, toolCallCount: countToolCalls(result.newItems) }),
  };
}

function buildContextTelemetry(input: { configuredMode: PoContextMode; effectiveMode: PoContextMode; classificationStatus: PoTaskClassificationStatus; taskClass: string | null; fallbackReason: string | null; packetBuild: PoEvidencePacketBuild | null; usage: AgentUsageLike; toolCallCount: number | null }): PoContextTelemetry {
  const packet = input.packetBuild?.context;
  const legacyEstimate = input.packetBuild?.legacyEstimatedTokens ?? null;
  const packedEstimate = packet?.telemetry.finalEstimatedTokens ?? null;
  return {
    configuredMode: input.configuredMode, mode: input.effectiveMode, taskClass: input.taskClass,
    classificationStatus: input.classificationStatus, fallbackReason: input.fallbackReason,
    baselineInputTokens: input.effectiveMode === "packed" ? null : input.usage.inputTokens,
    rawEvidenceItemCount: packet?.telemetry.rawEvidenceItemCount ?? null,
    rawEstimatedTokens: packet?.telemetry.rawEstimatedTokens ?? null,
    legacyEquivalentEstimatedTokens: legacyEstimate,
    packedEvidenceItemCount: packet?.telemetry.finalPacketItemCount ?? null,
    packedEstimatedTokens: packedEstimate,
    omittedEvidenceCount: packet?.telemetry.omittedItemCount ?? null,
    mandatoryEvidenceRetained: input.packetBuild?.mandatoryEvidenceRetained ?? null,
    budgetStatus: packet?.telemetry.budgetStatus ?? null,
    estimatedReductionPercent: legacyEstimate && packedEstimate !== null ? ((legacyEstimate - packedEstimate) / legacyEstimate) * 100 : null,
    actualInputTokens: input.usage.inputTokens || null,
    aggregateRunInputTokens: input.usage.inputTokens || null,
    aggregateRunOutputTokens: input.usage.outputTokens || null,
    modelRequestCount: input.usage.requests ?? input.usage.requestUsageEntries?.length ?? null,
    perRequestUsage: normalizePerRequestUsage(input.usage.requestUsageEntries),
    toolCallCount: input.toolCallCount,
  };
}

function normalizePerRequestUsage(entries: AgentUsageLike["requestUsageEntries"]) {
  if (!entries?.length || entries.some((entry) => !Number.isInteger(entry.inputTokens) || !Number.isInteger(entry.outputTokens))) return null;
  return entries.map((entry) => ({ inputTokens: entry.inputTokens!, outputTokens: entry.outputTokens! }));
}

function countToolCalls(items: Array<{ type?: string }> | undefined) {
  return items ? items.filter((item) => item.type === "tool_call_item").length : null;
}

export class PoAgentConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PoAgentConfigurationError";
  }
}

const poAgentInstructions = `You are the read-only Project Owner analyst for Maddox Training OS Phase B.

Use only the provided typed read tools. Never claim to edit, persist, save, commit, push, merge, deploy, mutate scope, modify Supabase, or change athlete data. If asked to change canonical scope, you may recommend a proposed value and explain why, but explicitly state that Phase B is read-only, canonical scope remains unchanged, and later Product Owner approval would be required.

Canonical structured detailed-record fields are the portfolio authority. Queue/index data and historical checkpoint prose are supporting evidence and may be stale. Surface contradictions and prefer the stronger/current evidence; never silently merge contradictory claims. Missing evidence remains missing. Do not infer dependency edges from prose similarity or invent scores.

For any question asking what to work on next, you MUST call get_next_work_candidates first. Explain and compare its deterministic result; do not independently construct, search, or rank the candidate pool from raw scope records. Do not promote review-only or reconciliation-required work into an executable recommendation.

For next-work responses use these headings: Recommendation; Deterministic eligibility/readiness; Current sequencing evidence; Contradictions; Confidence; Missing evidence; Strongest alternative; PO reconciliation/approval required. Your explanation is an Agent assessment over deterministic decision support, not canonical truth.

For other material recommendations, clearly distinguish Observed fact, Deterministically derived fact, Agent assessment, and PO-approved decision. Include Recommendation, Evidence, Confidence, Uncertainty or Missing Evidence, strongest alternative when relevant, and whether later Product Owner approval would be needed.`;

const packedPoAgentInstructions = `You are the read-only Project Owner analyst for Maddox Training OS Phase B.

The supplied EvidencePacket is authoritative for this request. Canonical facts must come from it. Omitted evidence is not permission to invent scope items, priority/status, lifecycle, blockers/prerequisites, dependencies, contradictions, missing evidence, sequencing, or provenance. If the packet does not support a claim, say evidence is insufficient. Do not request, reconstruct, search, or rank a broader candidate pool. Never claim to edit, persist, save, commit, push, merge, deploy, mutate scope, modify Supabase, or change athlete data.

Canonical evidence remains authoritative. Surface contradictions, missing evidence, provenance, blockers, prerequisites, and alternatives exactly as supplied. Never silently reconcile evidence, invent dependencies or scores, or label your explanation canonical truth.

For next-work responses use these headings: Recommendation; Deterministic eligibility/readiness; Current sequencing evidence; Contradictions; Confidence; Missing evidence; Strongest alternative; PO reconciliation/approval required. Your explanation is an Agent assessment over deterministic decision support, not canonical truth.

For other material recommendations, clearly distinguish Observed fact, Deterministically derived fact, Agent assessment, and PO-approved decision. Include Recommendation, Evidence, Confidence, Uncertainty or Missing Evidence, strongest alternative when relevant, and whether later Product Owner approval would be needed.`;
