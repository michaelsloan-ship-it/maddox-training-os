import { readFile } from "node:fs/promises";
import path from "node:path";

import { parseScopeMarkdown, type ParseScopeResult } from "../parser";

export const canonicalScopePath = "docs/SCOPE.md";

export interface LoadedCanonicalPortfolio extends ParseScopeResult {
  sourceRevision: string;
}

export async function loadCanonicalPortfolio(options: { rootDirectory?: string; sourceRevision?: string } = {}): Promise<LoadedCanonicalPortfolio> {
  assertServerRuntime();
  const rootDirectory = options.rootDirectory ?? process.cwd();
  const sourceRevision = options.sourceRevision ?? resolveSourceRevision();
  const markdown = await readFile(path.join(rootDirectory, canonicalScopePath), "utf8");
  const parsed = parseScopeMarkdown({ markdown, sourceFilePath: canonicalScopePath, sourceGitSha: sourceRevision });
  return { ...parsed, sourceRevision };
}

export function resolveSourceRevision(environment: Record<string, string | undefined> = process.env) {
  return environment.VERCEL_GIT_COMMIT_SHA || environment.GIT_SHA || environment.COMMIT_SHA || "unknown/local";
}

function assertServerRuntime() {
  if (typeof window !== "undefined") throw new Error("Canonical portfolio loading is server-only.");
}
