import { getPoAgentConfiguration } from "@/lib/governance/agent/orchestrator";
import { loadCanonicalPortfolio } from "@/lib/governance/server/portfolioLoader";
import { PoAgentLab } from "./PoAgentLab";

export const dynamic = "force-dynamic";

export default async function ProjectOwnerLabPage() {
  const loaded = await loadCanonicalPortfolio();
  const configuration = getPoAgentConfiguration();
  return (
    <div className="space-y-6" data-project-owner-lab>
      <header className="card bg-navy text-white">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-lime px-3 py-1 text-xs font-black text-navy">READ-ONLY</span>
          <span className="rounded-full border border-white/30 px-3 py-1 text-xs font-black">PHASE B</span>
        </div>
        <p className="mt-5 text-sm font-black uppercase tracking-[0.2em] text-lime">Engineering interaction surface</p>
        <h1 className="mt-2 text-4xl font-black">Project Owner Lab</h1>
        <p className="mt-3 max-w-3xl text-slate-200">Evidence-grounded portfolio analysis over canonical scope. This lab cannot edit scope, create mutations, write Markdown, or create GitHub changes. It is not the Admin Console.</p>
      </header>
      <section className="grid gap-4 sm:grid-cols-3" aria-label="Canonical source status">
        <div className="card"><p className="label">Canonical source</p><p className="mt-2 font-black">{loaded.portfolio.metadata.sourceFilePath}</p></div>
        <div className="card"><p className="label">Source revision</p><p className="mt-2 break-all font-mono text-sm">{loaded.sourceRevision}</p></div>
        <div className="card"><p className="label">Diagnostics</p><p className="mt-2 text-3xl font-black">{loaded.diagnostics.length}</p></div>
      </section>
      <PoAgentLab configured={configuration.configured} />
    </div>
  );
}
