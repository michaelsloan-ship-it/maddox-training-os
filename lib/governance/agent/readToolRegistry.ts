import { tool } from "@openai/agents";
import { z } from "zod";

import type { PortfolioReadService } from "../read/portfolioReadService";

export const readToolRegistry = [
  { name: "get_portfolio_summary", capability: "read", description: "Return canonical portfolio counts, distributions, diagnostics, source revision, and evidence policy." },
  { name: "get_scope_item", capability: "read", description: "Return one canonical detailed scope record by exact stable scope ID." },
  { name: "search_scope", capability: "read", description: "Search structured canonical scope fields for matching records." },
  { name: "get_scope_diagnostics", capability: "read", description: "Return deterministic parser diagnostics without repairing source content." },
  { name: "get_scope_dependencies", capability: "read", description: "Return explicit dependency evidence and structured graph relationships for one scope item." },
  { name: "get_priority_distribution", capability: "read", description: "Return the deterministic canonical priority distribution." },
  { name: "get_status_distribution", capability: "read", description: "Return the deterministic canonical status distribution." },
  { name: "get_scope_wsjf", capability: "read", description: "Return deterministic WSJF availability, inputs, and missing inputs for one scope item." },
  { name: "get_missing_evidence", capability: "read", description: "Return explicit missing canonical fields and unscored evidence dimensions for one scope item." },
  { name: "compare_scope_items", capability: "read", description: "Compare selected canonical scope records and their deterministic decision-support metadata." },
  { name: "get_next_work_candidates", capability: "read", description: "Return deterministically classified executable, review, reconciliation, and excluded next-work candidates with sequencing, lifecycle, blocker, and contradiction evidence." },
] as const;

export type ReadToolName = (typeof readToolRegistry)[number]["name"];

export function createAgentReadTools(service: PortfolioReadService) {
  const scopeId = z.object({ scopeId: z.string().trim().min(1).max(160) });
  return [
    tool({ name: "get_portfolio_summary", description: registryDescription("get_portfolio_summary"), parameters: z.object({}), execute: async () => service.getPortfolioSummary() }),
    tool({ name: "get_scope_item", description: registryDescription("get_scope_item"), parameters: scopeId, execute: async (input) => service.getScopeItem(input) }),
    tool({ name: "search_scope", description: registryDescription("search_scope"), parameters: z.object({ query: z.string().trim().min(1).max(300) }), execute: async (input) => service.searchScope(input) }),
    tool({ name: "get_scope_diagnostics", description: registryDescription("get_scope_diagnostics"), parameters: z.object({}), execute: async () => service.getScopeDiagnostics() }),
    tool({ name: "get_scope_dependencies", description: registryDescription("get_scope_dependencies"), parameters: scopeId, execute: async (input) => service.getScopeDependencies(input) }),
    tool({ name: "get_priority_distribution", description: registryDescription("get_priority_distribution"), parameters: z.object({}), execute: async () => service.getPriorityDistribution() }),
    tool({ name: "get_status_distribution", description: registryDescription("get_status_distribution"), parameters: z.object({}), execute: async () => service.getStatusDistribution() }),
    tool({ name: "get_scope_wsjf", description: registryDescription("get_scope_wsjf"), parameters: scopeId, execute: async (input) => service.getScopeWsjf(input) }),
    tool({ name: "get_missing_evidence", description: registryDescription("get_missing_evidence"), parameters: scopeId, execute: async (input) => service.getMissingEvidence(input) }),
    tool({ name: "compare_scope_items", description: registryDescription("compare_scope_items"), parameters: z.object({ scopeIds: z.array(z.string().trim().min(1).max(160)).min(2).max(12) }), execute: async (input) => service.compareScopeItems(input) }),
    tool({ name: "get_next_work_candidates", description: registryDescription("get_next_work_candidates"), parameters: z.object({}), execute: async () => service.getNextWorkCandidates() }),
  ];
}

function registryDescription(name: ReadToolName) {
  return readToolRegistry.find((entry) => entry.name === name)!.description;
}
