import type { ReactNode } from "react";
import { isSafeServerHref } from "@/lib/auth/access";

type InlinePart = { kind: "text" | "strong" | "emphasis" | "code" | "link"; value: string; href?: string; key: string };

const INLINE_TOKEN = /(\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|\*\*(.+?)\*\*|__(.+?)__|`([^`]+)`|(?<!\*)\*([^*]+)\*(?!\*)|(?<!_)_([^_]+)_(?!_)|(https?:\/\/[^\s)]+))/g;

function parseInline(value: string): InlinePart[] {
  const parts: InlinePart[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = INLINE_TOKEN.exec(value)) !== null) {
    if (match.index > cursor) parts.push({ kind: "text", value: value.slice(cursor, match.index), key: `text-${cursor}` });
    const [token, linkToken, linkLabel, linkHref, strong, strongAlt, code, emphasis, emphasisAlt, bareUrl] = match;
    if (linkToken && linkLabel && linkHref) parts.push({ kind: "link", value: linkLabel, href: isSafeServerHref(linkHref) ? linkHref : undefined, key: `link-${match.index}` });
    else if (strong ?? strongAlt) parts.push({ kind: "strong", value: strong ?? strongAlt ?? "", key: `strong-${match.index}` });
    else if (code) parts.push({ kind: "code", value: code, key: `code-${match.index}` });
    else if (emphasis ?? emphasisAlt) parts.push({ kind: "emphasis", value: emphasis ?? emphasisAlt ?? "", key: `emphasis-${match.index}` });
    else if (bareUrl) { /* URLs are intentionally not rendered as clickable content. */ }
    else parts.push({ kind: "text", value: token, key: `text-${match.index}` });
    cursor = match.index + token.length;
  }

  if (cursor < value.length) parts.push({ kind: "text", value: value.slice(cursor), key: `text-${cursor}` });
  return parts;
}

function renderInline(value: string): ReactNode[] {
  return parseInline(value).map((part) => {
    switch (part.kind) {
      case "strong": return <strong key={part.key}>{renderInline(part.value)}</strong>;
      case "emphasis": return <em key={part.key}>{renderInline(part.value)}</em>;
      case "code": return <code key={part.key} className="rounded bg-surface px-1.5 py-0.5 font-mono text-[0.9em] text-text-primary">{part.value}</code>;
      case "link": return part.href ? <a key={part.key} href={part.href} className="font-medium text-primary underline underline-offset-2 hover:text-primary-light">{renderInline(part.value)}</a> : part.value;
      default: return part.value;
    }
  });
}

function isUnorderedListLine(line: string): boolean { return /^\s*[-*+]\s+/.test(line); }
function isOrderedListLine(line: string): boolean { return /^\s*\d+[.)]\s+/.test(line); }
function isBlockLine(line: string): boolean { return /^(#{1,6})\s+/.test(line) || /^\s*>/.test(line) || isUnorderedListLine(line) || isOrderedListLine(line) || /^\s*```/.test(line); }

export function MarkdownContent({ content }: { content: string }): JSX.Element {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;
  let blockNumber = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (!line.trim()) { index += 1; continue; }

    const fence = line.match(/^\s*```\s*([\w-]*)\s*$/);
    if (fence) {
      const codeLines: string[] = [];
      const start = index;
      index += 1;
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index] ?? "")) { codeLines.push(lines[index] ?? ""); index += 1; }
      if (index < lines.length) index += 1;
      blocks.push(<pre key={`code-${start}`} className="my-2 overflow-x-auto rounded-lg bg-surface px-3 py-2 text-xs text-text-primary"><code className={fence[1] ? `language-${fence[1]}` : undefined}>{codeLines.join("\n")}</code></pre>);
      blockNumber += 1;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*$/);
    if (heading) {
      const headingLevel = heading[1]?.length ?? 1;
      const headingText = heading[2] ?? "";
      const Heading = `h${headingLevel}` as keyof JSX.IntrinsicElements;
      blocks.push(<Heading key={`heading-${index}`} className="mt-2 font-semibold text-text-primary">{renderInline(headingText)}</Heading>);
      index += 1;
      blockNumber += 1;
      continue;
    }

    if (isUnorderedListLine(line)) {
      const items: ReactNode[] = [];
      const start = index;
      while (index < lines.length && isUnorderedListLine(lines[index] ?? "")) {
        items.push(<li key={`item-${index}`}>{renderInline((lines[index] ?? "").replace(/^\s*[-*+]\s+/, ""))}</li>);
        index += 1;
      }
      blocks.push(<ul key={`list-${start}`} className="my-2 list-disc space-y-1 pl-5">{items}</ul>);
      blockNumber += 1;
      continue;
    }

    if (isOrderedListLine(line)) {
      const items: ReactNode[] = [];
      const start = index;
      while (index < lines.length && isOrderedListLine(lines[index] ?? "")) {
        items.push(<li key={`item-${index}`}>{renderInline((lines[index] ?? "").replace(/^\s*\d+[.)]\s+/, ""))}</li>);
        index += 1;
      }
      blocks.push(<ol key={`ordered-${start}`} className="my-2 list-decimal space-y-1 pl-5">{items}</ol>);
      blockNumber += 1;
      continue;
    }

    if (/^\s*>/.test(line)) {
      const quoteLines: string[] = [];
      const start = index;
      while (index < lines.length && /^\s*>/.test(lines[index] ?? "")) { quoteLines.push((lines[index] ?? "").replace(/^\s*>\s?/, "")); index += 1; }
      blocks.push(<blockquote key={`quote-${start}`} className="my-2 border-l-2 border-primary/40 pl-3 text-text-muted">{quoteLines.map((quoteLine, quoteIndex) => <div key={`quote-line-${start + quoteIndex}`}>{renderInline(quoteLine)}</div>)}</blockquote>);
      blockNumber += 1;
      continue;
    }

    const paragraphLines = [line];
    const start = index;
    index += 1;
    while (index < lines.length && (lines[index] ?? "").trim() && !isBlockLine(lines[index] ?? "")) { paragraphLines.push(lines[index] ?? ""); index += 1; }
    blocks.push(<p key={`paragraph-${start}-${blockNumber}`} className="leading-relaxed">{paragraphLines.flatMap((paragraphLine, lineIndex) => [lineIndex ? <br key={`break-${start + lineIndex}`} /> : null, ...renderInline(paragraphLine)])}</p>);
    blockNumber += 1;
  }

  return <div className="markdown-content">{blocks}</div>;
}
