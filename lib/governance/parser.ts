import type { CanonicalPortfolio, PortfolioReference, ScopeItem, ValidationDiagnostic } from "./types";

const requiredFields = [
  "title", "type", "parent", "priority", "status", "lane", "owner", "source", "problem",
  "desiredOutcome", "inScope", "outOfScope", "acceptanceCriteria", "dependencies", "risks",
  "nextAction", "linksEvidence",
] as const;

const fieldMap: Record<string, (typeof requiredFields)[number]> = {
  Title: "title",
  Type: "type",
  Parent: "parent",
  Priority: "priority",
  Status: "status",
  Lane: "lane",
  Owner: "owner",
  Source: "source",
  Problem: "problem",
  "Desired outcome": "desiredOutcome",
  "In scope": "inScope",
  "Out of scope": "outOfScope",
  "Acceptance criteria": "acceptanceCriteria",
  Dependencies: "dependencies",
  Risks: "risks",
  "Next action": "nextAction",
  "Links / evidence": "linksEvidence",
};

const listFields = new Set(["inScope", "outOfScope", "acceptanceCriteria", "dependencies", "risks", "linksEvidence"]);
const scopeIdPattern = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/;

export interface ParseScopeInput {
  markdown: string;
  sourceFilePath: string;
  sourceGitSha: string;
}

export interface ParseScopeResult {
  portfolio: CanonicalPortfolio;
  diagnostics: ValidationDiagnostic[];
}

export function parseScopeMarkdown(input: ParseScopeInput): ParseScopeResult {
  const diagnostics: ValidationDiagnostic[] = [];
  const items: ScopeItem[] = [];
  const records = detailedRecordBlocks(input.markdown);
  const seen = new Set<string>();

  for (const record of records) {
    const item = parseRecord(record.heading, record.body, input.sourceFilePath, diagnostics);
    if (!item) continue;
    if (seen.has(item.id)) {
      diagnostics.push({ code: "duplicate_detailed_id", severity: "error", scopeId: item.id, message: `Duplicate detailed scope ID: ${item.id}` });
    }
    seen.add(item.id);
    items.push(item);
  }

  return {
    portfolio: {
      metadata: {
        sourceFilePath: input.sourceFilePath,
        sourceGitSha: input.sourceGitSha,
        sourceContentHash: stableHash(input.markdown),
        parsedAt: null,
      },
      items,
      references: parseReferences(input.markdown),
      dependencyEdges: [],
    },
    diagnostics,
  };
}

function detailedRecordBlocks(markdown: string) {
  const matches = Array.from(markdown.matchAll(/^### ([^\n]+)\n/gm));
  return matches.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? markdown.length;
    return { heading: match[1].trim(), body: markdown.slice(start, end) };
  }).filter(({ heading, body }) => scopeIdPattern.test(heading) && /^- ID:/m.test(body));
}

function parseRecord(heading: string, body: string, filePath: string, diagnostics: ValidationDiagnostic[]): ScopeItem | null {
  const fields = new Map<string, string[]>();
  let activeField: string | null = null;
  let explicitId: string | null = null;

  for (const line of body.split("\n")) {
    const top = line.match(/^- ([^:]+):(?: (.*))?$/);
    if (top) {
      const label = top[1].trim();
      if (label === "ID") {
        explicitId = (top[2] ?? "").trim() || null;
        activeField = null;
        continue;
      }
      activeField = fieldMap[label] ?? null;
      if (activeField) fields.set(activeField, top[2]?.trim() ? [top[2].trim()] : []);
      continue;
    }
    if (!activeField) continue;
    const nested = line.match(/^\s{2,}(?:[-*]|\d+\.)\s+(.*)$/);
    if (nested) fields.get(activeField)?.push(nested[1].trim());
  }

  if (!explicitId) {
    diagnostics.push({ code: "malformed_record", severity: "error", scopeId: heading, message: `Detailed record ${heading} has no usable ID field.` });
    return null;
  }
  if (explicitId !== heading) {
    diagnostics.push({ code: "ambiguous_record_id", severity: "error", scopeId: explicitId, message: `Heading ${heading} does not match ID ${explicitId}.` });
  }

  const missingFields = requiredFields.filter((field) => !fields.get(field)?.length);
  for (const field of missingFields) diagnostics.push({ code: "missing_field", severity: "warning", scopeId: explicitId, fieldPath: field, message: `${explicitId} is missing ${field}.` });
  const scalar = (name: string) => fields.get(name)?.[0] ?? null;
  const list = (name: string) => fields.get(name) ?? [];

  return {
    id: explicitId,
    title: scalar("title"),
    type: scalar("type"),
    parent: scalar("parent"),
    priority: scalar("priority"),
    status: scalar("status"),
    lane: scalar("lane"),
    owner: scalar("owner"),
    source: scalar("source"),
    problem: scalar("problem"),
    desiredOutcome: scalar("desiredOutcome"),
    inScope: list("inScope"),
    outOfScope: list("outOfScope"),
    acceptanceCriteria: list("acceptanceCriteria"),
    dependencies: list("dependencies"),
    risks: list("risks"),
    nextAction: scalar("nextAction"),
    linksEvidence: list("linksEvidence"),
    scores: {},
    sourceLocation: { filePath, heading, recordFingerprint: stableHash(`${heading}\n${body}`) },
    missingFields,
  };
}

function parseReferences(markdown: string): PortfolioReference[] {
  const references: PortfolioReference[] = [];
  let section = "";
  for (const line of markdown.split("\n")) {
    const sectionMatch = line.match(/^## (.+)$/);
    if (sectionMatch) section = sectionMatch[1];
    if (!line.startsWith("|")) continue;
    const source = section === "Active Execution Queue" ? "active_queue" : section === "Scope Item Index By Priority And Status" ? "priority_index" : null;
    if (!source) continue;
    const cells = line.split("|").map((cell) => cell.trim()).filter(Boolean);
    for (const cell of cells) {
      for (const token of cell.split(/,\s*|\s+/)) {
        const scopeId = token.replace(/[`.;]$/g, "");
        if (scopeIdPattern.test(scopeId)) references.push({ scopeId, source, context: line });
      }
    }
  }
  return uniqueReferences(references);
}

function uniqueReferences(references: PortfolioReference[]) {
  const seen = new Set<string>();
  return references.filter((reference) => {
    const key = `${reference.source}:${reference.scopeId}:${reference.context}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
