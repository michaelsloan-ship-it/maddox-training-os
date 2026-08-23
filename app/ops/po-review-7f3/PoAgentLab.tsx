"use client";

import { FormEvent, useState } from "react";
import { SafeMarkdown } from "./SafeMarkdown";
import { accumulateSessionEstimatedCost, type PoAgentUsageMetadata } from "@/lib/governance/agent/usageMetadata";

const starterPrompts = [
  "What should we work on next?",
  "Explain GOV-PO-AGENT-001.",
  "Which P1 items appear blocked?",
  "What scope appears stale?",
  "Compare GOV-PO-AGENT-001 and ADMIN-PROJECT-OWNER-CONSOLE-001.",
  "What evidence is missing for GOV-PO-AGENT-001?",
];

interface LabResponse {
  answer?: string;
  error?: string;
  sourceRevision?: string;
  usage?: PoAgentUsageMetadata;
}

export function PoAgentLab({ configured }: { configured: boolean }) {
  const [question, setQuestion] = useState(starterPrompts[0]);
  const [response, setResponse] = useState<LabResponse | null>(null);
  const [pending, setPending] = useState(false);
  const [sessionTotal, setSessionTotal] = useState<number | null>(0);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setResponse(null);
    try {
      const request = await fetch("/api/ops/po-agent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question }) });
      const result = await request.json() as LabResponse;
      setResponse(result);
      if (result.usage) setSessionTotal((total) => accumulateSessionEstimatedCost(total, result.usage!.estimatedCostUsd));
    } catch {
      setResponse({ error: "PO Agent request could not be completed. Canonical scope was not changed." });
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="label text-blue">Read-only conversation</p>
          <h2 className="text-2xl font-black">Ask the portfolio</h2>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-black ${configured ? "bg-lime text-navy" : "bg-amber-100 text-amber-900"}`}>
          {configured ? "Agent configured" : "Agent unconfigured"}
        </span>
      </div>
      {!configured && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-950">The server agent API is not configured. Requests fail explicitly; the rest of the app remains available.</p>}
      <div className="mt-5 flex flex-wrap gap-2" aria-label="Starter prompts">
        {starterPrompts.map((prompt) => <button className="rounded-full border border-rink px-3 py-2 text-left text-xs font-bold hover:bg-ice" key={prompt} type="button" onClick={() => setQuestion(prompt)}>{prompt}</button>)}
      </div>
      <form className="mt-5" onSubmit={submit}>
        <label className="label" htmlFor="po-question">Product Owner question</label>
        <textarea id="po-question" maxLength={2000} required value={question} onChange={(event) => setQuestion(event.target.value)} className="mt-2 min-h-32 w-full rounded-2xl border border-rink bg-white p-4 text-navy" />
        <button className="btn-primary mt-3" disabled={pending} type="submit">{pending ? "Analyzing…" : "Ask read-only agent"}</button>
      </form>
      <div className="mt-6 min-h-32 rounded-2xl bg-ice p-4" aria-live="polite" data-po-response>
        <p className="label">Response</p>
        {!response && <p className="mt-2 text-sm text-slate-600">No response yet. No question can modify canonical scope in Phase B.</p>}
        {response?.answer && <SafeMarkdown text={response.answer} />}
        {response?.error && <p className="mt-2 font-bold text-red-700">{response.error}</p>}
        {response?.usage && <dl className="mt-5 grid gap-2 border-t border-rink pt-4 text-sm sm:grid-cols-3" data-po-usage>
          <div><dt className="label">Model</dt><dd className="font-mono">{response.usage.model}</dd></div>
          <div><dt className="label">Input tokens</dt><dd>{response.usage.inputTokens ?? "Unavailable"}</dd></div>
          <div><dt className="label">Output tokens</dt><dd>{response.usage.outputTokens ?? "Unavailable"}</dd></div>
          <div><dt className="label">Total tokens</dt><dd>{response.usage.totalTokens ?? "Unavailable"}</dd></div>
          <div><dt className="label">Estimated API cost</dt><dd>{response.usage.estimatedCostUsd === null ? "Unavailable" : `$${response.usage.estimatedCostUsd.toFixed(6)}`}</dd></div>
          <div><dt className="label">Estimated session total</dt><dd>{sessionTotal === null ? "Unavailable" : `$${sessionTotal.toFixed(6)}`}</dd></div>
          {response.usage.costAssumption && <div className="sm:col-span-3"><dt className="label">Assumption</dt><dd>{response.usage.costAssumption === "assumes_uncached_input" ? "Uncached input" : "SDK cached-input breakdown"}</dd></div>}
          {response.usage.costLimitation && <div className="sm:col-span-3"><dt className="label">Cost limitation</dt><dd>{response.usage.costLimitation}</dd></div>}
        </dl>}
      </div>
    </section>
  );
}
