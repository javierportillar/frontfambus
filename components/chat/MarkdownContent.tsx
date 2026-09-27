import type { ReactNode } from "react";
import type { EntityRef } from "@/lib/api/chat";
import {
  canAccessAssistantDomain,
  isSafeAssistantEntityHref,
  isSafeServerHref,
  type AccessContext,
} from "@/lib/auth/access";

type InlinePart = { kind: "text" | "strong" | "emphasis" | "code" | "link"; value: string; href?: string; key: string };

const INLINE_TOKEN = /(\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|\*\*(.+?)\*\*|__(.+?)__|`([^`]+)`|(?<!\*)\*([^*]+)\*(?!\*)|(?<!_)_([^_]+)_(?!_)|(https?:\/\/[^\s)]+))/g;

interface ProductMention {
  term: string;
  ref: EntityRef;
  isSku: boolean;
}

function visibleEntityRefs(refs: EntityRef[], context?: AccessContext): EntityRef[] {
  if (!context) return [];
  return refs.filter((ref) => (
    isSafeAssistantEntityHref(ref.entity_type, ref.entity_id, ref.domain, ref.href)
    && canAccessAssistantDomain(ref.domain, context)
  ));
}

function productMentions(refs: EntityRef[]): ProductMention[] {
  const products = refs.filter((ref) => (
    ref.entity_type === "product"
    && ref.domain === "inventory"
  ));
  const labelCounts = new Map<string, number>();
  for (const ref of products) {
    const key = ref.label.toLocaleLowerCase("es-CO");
    labelCounts.set(key, (labelCounts.get(key) ?? 0) + 1);
  }

  return products.flatMap((ref) => {
    const mentions: ProductMention[] = [{ term: ref.entity_id, ref, isSku: true }];
    const normalizedLabel = ref.label.toLocaleLowerCase("es-CO");
    if (ref.label_is_unique !== false
      && normalizedLabel
      && normalizedLabel !== ref.entity_id.toLocaleLowerCase("es-CO")
      && labelCounts.get(normalizedLabel) === 1) {
      mentions.push({ term: ref.label, ref, isSku: false });
    }
    return mentions;
  }).sort((left, right) => right.term.length - left.term.length);
}

function isWordCharacter(value: string | undefined): boolean {
  return value !== undefined && /[\p{L}\p{N}_]/u.test(value);
}

function countWholeTerm(value: string, term: string): number {
  const haystack = value.toLocaleLowerCase("es-CO");
  const needle = term.toLocaleLowerCase("es-CO");
  if (!needle) return 0;
  let searchFrom = 0;
  let count = 0;
  while (needle && searchFrom < haystack.length) {
    const start = haystack.indexOf(needle, searchFrom);
    if (start < 0) return count;
    const end = start + needle.length;
    if (!isWordCharacter(value[start - 1]) && !isWordCharacter(value[end])) count += 1;
    searchFrom = end;
  }
  return count;
}

function containsWholeTerm(value: string, term: string): boolean {
  return countWholeTerm(value, term) > 0;
}

function visibleMarkdownText(value: string): string {
  return value
    .replace(/\[([^\]]+)\]\([^)\s]+(?:\s+"[^"]*")?\)/g, "$1")
    .replace(/https?:\/\/[^\s)]+/gi, " ");
}

function linkProductMentions(
  value: string,
  mentions: ProductMention[],
  keyPrefix: string,
  context: string,
): ReactNode[] {
  if (!mentions.length || !value) return [value];
  const lowerValue = value.toLocaleLowerCase("es-CO");
  const visibleContext = visibleMarkdownText(context);
  const matches: Array<{ start: number; end: number; mention: ProductMention }> = [];

  for (const mention of mentions) {
    const term = mention.term.toLocaleLowerCase("es-CO");
    if (!term) continue;
    let searchFrom = 0;
    while (searchFrom < lowerValue.length) {
      const start = lowerValue.indexOf(term, searchFrom);
      if (start < 0) break;
      const end = start + term.length;
      const needsNameContext = mention.isSku && /^\d+$/.test(mention.ref.entity_id);
      if (!isWordCharacter(value[start - 1])
        && !isWordCharacter(value[end])
        && (!needsNameContext || (
          containsWholeTerm(visibleContext, mention.ref.label)
          && countWholeTerm(visibleContext, mention.ref.entity_id) === 1
        ))) {
        matches.push({ start, end, mention });
      }
      searchFrom = end;
    }
  }

  matches.sort((left, right) => left.start - right.start || right.end - left.end);
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const [index, match] of matches.entries()) {
    if (match.start < cursor) continue;
    if (match.start > cursor) nodes.push(value.slice(cursor, match.start));
    const visibleText = value.slice(match.start, match.end);
    nodes.push(
      <a
        key={`${keyPrefix}-product-${match.mention.ref.entity_id}-${match.start}-${index}`}
        href={match.mention.ref.href}
        aria-label={`Ver ficha de ${match.mention.ref.label}${match.mention.isSku ? ` (${match.mention.ref.entity_id})` : ""}`}
        className="font-medium text-primary underline underline-offset-2 hover:text-primary-light"
      >
        {visibleText}
      </a>,
    );
    cursor = match.end;
  }
  if (cursor < value.length) nodes.push(value.slice(cursor));
  return nodes.length ? nodes : [value];
}

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

function renderInline(
  value: string,
  mentions: ProductMention[] = [],
  entityRefs: EntityRef[] = [],
  context: string = value,
): ReactNode[] {
  return parseInline(value).map((part) => {
    switch (part.kind) {
      case "strong": return <strong key={part.key}>{renderInline(part.value, mentions, entityRefs, context)}</strong>;
      case "emphasis": return <em key={part.key}>{renderInline(part.value, mentions, entityRefs, context)}</em>;
      case "code": {
        const skuLink = mentions.find((mention) => (
          mention.isSku && mention.term.toLocaleLowerCase("es-CO") === part.value.toLocaleLowerCase("es-CO")
        ));
        const numericSkuNeedsName = skuLink && /^\d+$/.test(skuLink.ref.entity_id)
          && (!containsWholeTerm(visibleMarkdownText(context), skuLink.ref.label)
            || countWholeTerm(visibleMarkdownText(context), skuLink.ref.entity_id) !== 1);
        const code = <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-[0.9em] text-text-primary">{part.value}</code>;
        return skuLink && !numericSkuNeedsName
          ? <a key={part.key} href={skuLink.ref.href} aria-label={`Ver ficha de ${skuLink.ref.label} (${skuLink.ref.entity_id})`}>{code}</a>
          : <span key={part.key}>{code}</span>;
      }
      case "link": {
        const ref = entityRefs.find((item) => item.href === part.href);
        const ambiguousProductName = ref?.entity_type === "product"
          && ref.label_is_unique === false
          && part.value.trim().toLocaleLowerCase("es-CO") === ref.label.toLocaleLowerCase("es-CO");
        const visibleContext = visibleMarkdownText(context);
        const numericSkuNeedsName = ref?.entity_type === "product"
          && /^\d+$/.test(ref.entity_id)
          && !containsWholeTerm(visibleContext, ref.label);
        return part.href && ref && !ambiguousProductName && !numericSkuNeedsName
          ? <a key={part.key} href={part.href} className="font-medium text-primary underline underline-offset-2 hover:text-primary-light">{renderInline(part.value)}</a>
          : part.value;
      }
      default: return linkProductMentions(part.value, mentions, part.key, context);
    }
  });
}

function isUnorderedListLine(line: string): boolean { return /^\s*[-*+]\s+/.test(line); }
function isOrderedListLine(line: string): boolean { return /^\s*\d+[.)]\s+/.test(line); }
function isBlockLine(line: string): boolean {
  return /^\s*```/.test(line)
    || /^#{1,6}\s+/.test(line)
    || isTableLine(line)
    || isUnorderedListLine(line)
    || isOrderedListLine(line)
    || /^\s*>/.test(line);
}
function isTableLine(line: string): boolean { return /^\s*\|.*\|\s*$/.test(line); }
function isTableSeparator(line: string): boolean { return /^\s*\|?\s*[-:]+[-|:\s]+\s*$/.test(line); }

function parseTableRow(line: string): string[] {
  return line
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function MarkdownTable({
  rows,
  mentions,
  entityRefs,
}: {
  rows: string[][];
  mentions: ProductMention[];
  entityRefs: EntityRef[];
}): JSX.Element {
  const header = rows[0] ?? [];
  const body = rows.slice(2); // skip separator row
  return (
    <div className="my-3 overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-surface-alt">
            {header.map((cell, i) => (
              <th key={`th-${i}`} className="border-b border-border px-2.5 py-1.5 text-left font-semibold text-text-primary">{renderInline(cell, mentions, entityRefs)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => (
            <tr key={`tr-${ri}`} className={ri % 2 === 0 ? "bg-surface" : "bg-surface-alt/50"}>
              {row.map((cell, ci) => {
                return (
                  <td key={`td-${ri}-${ci}`} className="border-t border-border/50 px-2.5 py-1.5 text-text-secondary">
                    {renderInline(cell, mentions, entityRefs, cell)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MarkdownContent({
  content,
  entityRefs = [],
  accessContext,
}: {
  content: string;
  entityRefs?: EntityRef[];
  accessContext?: AccessContext;
}): JSX.Element {
  const authorizedEntityRefs = visibleEntityRefs(entityRefs, accessContext);
  const mentions = productMentions(authorizedEntityRefs);
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
      blocks.push(<Heading key={`heading-${index}`} className="mt-2 font-semibold text-text-primary">{renderInline(headingText, mentions, authorizedEntityRefs)}</Heading>);
      index += 1;
      blockNumber += 1;
      continue;
    }

    // Table detection: header row + separator row + data rows
    if (isTableLine(line) && index + 1 < lines.length && isTableSeparator(lines[index + 1] ?? "")) {
      const tableRows: string[][] = [];
      const start = index;
      while (index < lines.length && isTableLine(lines[index] ?? "")) {
        tableRows.push(parseTableRow(lines[index] ?? ""));
        index += 1;
      }
      if (tableRows.length >= 2) {
        blocks.push(<MarkdownTable key={`table-${start}`} rows={tableRows} mentions={mentions} entityRefs={authorizedEntityRefs} />);
      }
      blockNumber += 1;
      continue;
    }

    if (isUnorderedListLine(line)) {
      const items: ReactNode[] = [];
      const start = index;
      while (index < lines.length && isUnorderedListLine(lines[index] ?? "")) {
        items.push(<li key={`item-${index}`}>{renderInline((lines[index] ?? "").replace(/^\s*[-*+]\s+/, ""), mentions, authorizedEntityRefs)}</li>);
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
        items.push(<li key={`item-${index}`}>{renderInline((lines[index] ?? "").replace(/^\s*\d+[.)]\s+/, ""), mentions, authorizedEntityRefs)}</li>);
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
      blocks.push(<blockquote key={`quote-${start}`} className="my-2 border-l-2 border-primary/40 pl-3 text-text-muted">{quoteLines.map((quoteLine, quoteIndex) => <div key={`quote-line-${start + quoteIndex}`}>{renderInline(quoteLine, mentions, authorizedEntityRefs)}</div>)}</blockquote>);
      blockNumber += 1;
      continue;
    }

    const paragraphLines = [line];
    const start = index;
    index += 1;
    while (index < lines.length && (lines[index] ?? "").trim() && !isBlockLine(lines[index] ?? "")) { paragraphLines.push(lines[index] ?? ""); index += 1; }
    blocks.push(<p key={`paragraph-${start}-${blockNumber}`} className="leading-relaxed">{paragraphLines.flatMap((paragraphLine, lineIndex) => [lineIndex ? <br key={`break-${start + lineIndex}`} /> : null, ...renderInline(paragraphLine, mentions, authorizedEntityRefs)])}</p>);
    blockNumber += 1;
  }

  return <div className="markdown-content">{blocks}</div>;
}
