import { planIntelligenceRoute } from "./routing/policy";
import type { IntelligenceRegistrySnapshot } from "./registry";
import type { ModelGateway } from "./providers/types";
import type { IntelligenceResult, IntelligenceTaskRequest } from "./types";

/** MR-A planning gateway. Execution intentionally remains disconnected from Phase B and all providers. */
export class PlanningModelGateway implements ModelGateway {
  constructor(private readonly registry: IntelligenceRegistrySnapshot) {}
  plan(request: IntelligenceTaskRequest) { return planIntelligenceRoute(request, this.registry); }
  async execute(_request: IntelligenceTaskRequest): Promise<IntelligenceResult> {
    throw new Error("Provider execution is not configured in MODEL-ROUTING-001 MR-A.");
  }
}
