export interface ReadOnlyRequestPolicy {
  requestsCanonicalChange: boolean;
  notice: string | null;
}

const changeRequest = /\b(make|change|set|update|edit|rewrite|move|mark|raise|lower|delete|remove)\b/i;

export function evaluateReadOnlyRequest(question: string): ReadOnlyRequestPolicy {
  const requestsCanonicalChange = changeRequest.test(question);
  return {
    requestsCanonicalChange,
    notice: requestsCanonicalChange
      ? "Phase B is read-only. The agent may analyze or recommend a change, but canonical scope remains unchanged and Product Owner approval would be required for any later persisted change."
      : null,
  };
}
