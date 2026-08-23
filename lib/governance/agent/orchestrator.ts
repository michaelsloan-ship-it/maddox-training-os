import { Agent, run } from "@openai/agents";

import { evaluateReadOnlyRequest } from "./readOnlyPolicy";
import { createAgentReadTools } from "./readToolRegistry";
import { createPortfolioReadService } from "../read/portfolioReadService";
import { loadCanonicalPortfolio } from "../server/portfolioLoader";
import { buildUsageMetadata, type PoAgentUsageMetadata } from "./usageMetadata";

export interface PoAgentResponse {
  answer: string;
  readOnly: true;
  canonicalSource: string;
  sourceRevision: string;
  diagnosticCount: number;
  usage: PoAgentUsageMetadata;
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
  const configuration = assertPoAgentExecutionAllowed();

  const loaded = await loadCanonicalPortfolio();
  const service = createPortfolioReadService(loaded);
  const requestPolicy = evaluateReadOnlyRequest(question);
  const agent = new Agent({
    name: "Maddox Training OS Project Owner Analyst",
    model: configuration.model,
    instructions: poAgentInstructions,
    tools: createAgentReadTools(service),
  });
  const input = requestPolicy.notice ? `${question}\n\nDeterministic read-only policy notice: ${requestPolicy.notice}` : question;
  const result = await run(agent, input, { maxTurns: 10 });
  const answer = result.finalOutput;
  if (typeof answer !== "string" || !answer.trim()) throw new Error("PO Agent returned no response.");
  return {
    answer,
    readOnly: true,
    canonicalSource: loaded.portfolio.metadata.sourceFilePath,
    sourceRevision: loaded.sourceRevision,
    diagnosticCount: loaded.diagnostics.length,
    usage: buildUsageMetadata(configuration.model, result.state.usage),
  };
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
