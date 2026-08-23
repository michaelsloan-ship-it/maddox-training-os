import { Fragment, type ReactNode } from "react";

export function SafeMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (line.startsWith("```")) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith("```")) code.push(lines[index++]);
      blocks.push(<pre className="my-3 overflow-x-auto rounded-xl bg-navy p-3 text-sm text-white" key={`code-${index}`}><code>{code.join("\n")}</code></pre>);
      index += 1;
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const content = inlineMarkdown(heading[2]);
      blocks.push(heading[1].length === 1 ? <h2 className="mt-4 text-2xl font-black" key={index}>{content}</h2>
        : heading[1].length === 2 ? <h3 className="mt-4 text-xl font-black" key={index}>{content}</h3>
          : <h4 className="mt-3 text-lg font-black" key={index}>{content}</h4>);
      index += 1;
      continue;
    }
    if (/^\s*[-*]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: ReactNode[] = [];
      while (index < lines.length && (ordered ? /^\s*\d+\.\s+/.test(lines[index]) : /^\s*[-*]\s+/.test(lines[index]))) {
        items.push(<li key={index}>{inlineMarkdown(lines[index].replace(ordered ? /^\s*\d+\.\s+/ : /^\s*[-*]\s+/, ""))}</li>);
        index += 1;
      }
      blocks.push(ordered ? <ol className="my-3 list-decimal space-y-1 pl-6" key={`list-${index}`}>{items}</ol> : <ul className="my-3 list-disc space-y-1 pl-6" key={`list-${index}`}>{items}</ul>);
      continue;
    }
    if (!line.trim()) { index += 1; continue; }
    const paragraph = [line];
    index += 1;
    while (index < lines.length && lines[index].trim() && !/^(#{1,3})\s+|^```|^\s*(?:[-*]|\d+\.)\s+/.test(lines[index])) paragraph.push(lines[index++]);
    blocks.push(<p className="my-2" key={`p-${index}`}>{inlineMarkdown(paragraph.join("\n"))}</p>);
  }
  return <div className="whitespace-pre-wrap" data-safe-markdown>{blocks}</div>;
}

function inlineMarkdown(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|_([^_]+)_|<[^>]*>)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const at = match.index;
    if (at > last) nodes.push(text.slice(last, at));
    if (match[2] !== undefined) {
      const href = safeHref(match[3]);
      nodes.push(href ? <a className="font-bold text-blue underline" href={href} key={at} rel="noopener noreferrer" target="_blank">{match[2]}</a> : <Fragment key={at}>{match[2]}</Fragment>);
    } else if (match[4] !== undefined) nodes.push(<code className="rounded bg-slate-200 px-1 font-mono text-sm" key={at}>{match[4]}</code>);
    else if (match[5] !== undefined) nodes.push(<strong key={at}>{match[5]}</strong>);
    else if (match[6] !== undefined) nodes.push(<em key={at}>{match[6]}</em>);
    else nodes.push(match[0]);
    last = at + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function safeHref(value: string) {
  const href = value.trim();
  if (/^(https?:\/\/|mailto:)/i.test(href)) return href;
  if (/^(\/|#)(?!\/)/.test(href)) return href;
  return null;
}
