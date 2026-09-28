import type { ReactNode } from "react";
import type { EntityRef } from "@/lib/api/chat";
import { parsePurchaseDocumentEntityId } from "@/lib/compras/routes";
import {
  canAccessAssistantDomain,
  isSafeAssistantEntityHref,
  isSafeServerHref,
  type AccessContext,
} from "@/lib/auth/access";

type InlinePart = { kind: "text" | "strong" | "emphasis" | "code" | "link"; value: string; href?: string; key: string };

const INLINE_TOKEN = /(\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|\*\*(.+?)\*\*|__(.+?)__|`([^`]+)`|(?<!\*)\*([^*]+)\*(?!\*)|(?<!_)_([^_]+)_(?!_)|(https?:\/\/[^\s)]+))/g;

type MentionKind = "product-sku" | "product-name" | "supplier-nit" | "supplier-name" | "purchase-document";

interface EntityMention {
  term: string;
  ref: EntityRef;
  kind: MentionKind;
}

function visibleEntityRefs(refs: EntityRef[], context?: AccessContext): EntityRef[] {
  if (!context) return [];
  return refs.filter((ref) => (
    isSafeAssistantEntityHref(ref.entity_type, ref.entity_id, ref.domain, ref.href)
    && canAccessAssistantDomain(ref.domain, context)
  ));
}

function assistantMentions(refs: EntityRef[]): EntityMention[] {
  const products = refs.filter((ref) => (
    ref.entity_type === "product"
    && ref.domain === "inventory"
  ));
  const suppliers = refs.filter((ref) => ref.entity_type === "supplier" && ref.domain === "purchases");
  const productLabelCounts = new Map<string, number>();
  const supplierLabelCounts = new Map<string, number>();
  for (const ref of products) {
    const key = ref.label.toLocaleLowerCase("es-CO");
    productLabelCounts.set(key, (productLabelCounts.get(key) ?? 0) + 1);
  }
  for (const ref of suppliers) {
    const key = ref.label.toLocaleLowerCase("es-CO");
    supplierLabelCounts.set(key, (supplierLabelCounts.get(key) ?? 0) + 1);
  }

  const mentions: EntityMention[] = [];
  for (const ref of products) {
    mentions.push({ term: ref.entity_id, ref, kind: "product-sku" });
    const normalizedLabel = ref.label.toLocaleLowerCase("es-CO");
    if (ref.label_is_unique !== false
      && normalizedLabel
      && normalizedLabel !== ref.entity_id.toLocaleLowerCase("es-CO")
      && productLabelCounts.get(normalizedLabel) === 1) {
      mentions.push({ term: ref.label, ref, kind: "product-name" });
    }
  }
  for (const ref of suppliers) {
    mentions.push({ term: ref.entity_id, ref, kind: "supplier-nit" });
    const normalizedLabel = ref.label.toLocaleLowerCase("es-CO");
    if (ref.label_is_unique === true
      && normalizedLabel
      && normalizedLabel !== ref.entity_id.toLocaleLowerCase("es-CO")
      && supplierLabelCounts.get(normalizedLabel) === 1) {
      mentions.push({ term: ref.label, ref, kind: "supplier-name" });
    }
  }
  for (const ref of refs.filter((item) => item.entity_type === "purchase_document" && item.domain === "purchases")) {
    const identity = parsePurchaseDocumentEntityId(ref.entity_id);
    if (identity) mentions.push({ term: identity.documentNumber, ref, kind: "purchase-document" });
  }
  return mentions.sort((left, right) => right.term.length - left.term.length);
}

function isWordCharacter(value: string | undefined): boolean {
  return value !== undefined && /[\p{L}\p{N}_]/u.test(value);
}

function isIdentifierContinuation(value: string | undefined): boolean {
  return value !== undefined && /[\p{L}\p{N}_./-]/u.test(value);
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

function countPurchaseDocumentNumber(value: string, documentNumber: string): number {
  const haystack = value.toLocaleLowerCase("es-CO");
  const needle = documentNumber.toLocaleLowerCase("es-CO");
  if (!needle) return 0;
  let searchFrom = 0;
  let count = 0;
  while (searchFrom < haystack.length) {
    const start = haystack.indexOf(needle, searchFrom);
    if (start < 0) return count;
    const end = start + needle.length;
    const left = value[start - 1];
    const right = value[end];
    const numberOrIdentifierPunctuation = (character: string | undefined) => (
      character !== undefined && /[\p{L}\p{N}_./,-]/u.test(character)
    );
    if (!numberOrIdentifierPunctuation(left) && !numberOrIdentifierPunctuation(right)) count += 1;
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasExplicitDocumentLabel(value: string, documentNumber: string): boolean {
  const pattern = new RegExp(
    `\\b(?:factura|documento|comprobante|doc)\\.?\\s*[^\\d\\n]{0,20}${escapeRegExp(documentNumber)}(?![\\p{L}\\p{N}_./-])`,
    "iu",
  );
  return pattern.test(value);
}

function purchaseDocumentMentionContexts(value: string, documentNumber: string): string[] {
  const visible = visibleMarkdownText(value);
  const contexts = visible.split("\n").filter((line) => (
    countPurchaseDocumentNumber(line, documentNumber) === 1
    && hasExplicitDocumentLabel(line, documentNumber)
  ));
  const lines = visible.split("\n");
  for (let index = 0; index + 2 < lines.length; index += 1) {
    const headerLine = lines[index]?.trim() ?? "";
    const separatorLine = lines[index + 1]?.trim() ?? "";
    if (!isTableLine(headerLine) || !isTableSeparator(separatorLine)) continue;
    const headers = parseTableRow(headerLine);
    const documentColumns = headers.flatMap((header, column) => (
      /\b(?:factura|documento|comprobante|doc)\b/i.test(header) ? [column] : []
    ));
    const identityColumns = headers.flatMap((header, column) => (
      /\b(?:fecha|date|clase|cod[_\s]*clase)\b/i.test(header) ? [column] : []
    ));
    index += 2;
    while (index < lines.length && isTableLine(lines[index] ?? "")) {
      const cells = parseTableRow(lines[index] ?? "");
      if (documentColumns.some((column) => (
        visibleMarkdownText(cells[column] ?? "").trim() === documentNumber
      ))) {
        const evidenceColumns = [...new Set([...documentColumns, ...identityColumns])];
        const rowContext = evidenceColumns
          .map((column) => `${headers[column] ?? ""}: ${cells[column] ?? ""}`)
          .join(" | ");
        if (countPurchaseDocumentNumber(rowContext, documentNumber) === 1) contexts.push(rowContext);
      }
      index += 1;
    }
    index -= 1;
  }
  return contexts;
}

function isVerifiedPurchaseDocumentMention(
  ref: EntityRef,
  refs: EntityRef[],
  value: string,
): boolean {
  const identity = parsePurchaseDocumentEntityId(ref.entity_id);
  if (!identity) return false;
  const matchingRefs = [...new Map(
    refs
      .filter((candidate) => candidate.entity_type === "purchase_document")
      .map((candidate) => [candidate.entity_id, candidate]),
  ).values()]
    .map((candidate) => ({ ref: candidate, identity: parsePurchaseDocumentEntityId(candidate.entity_id) }))
    .filter((candidate) => candidate.identity?.documentNumber === identity.documentNumber);
  if (!matchingRefs.some((candidate) => candidate.ref.entity_id === ref.entity_id)) return false;

  return purchaseDocumentMentionContexts(value, identity.documentNumber).some((context) => {
    if (matchingRefs.length === 1) return true;
    const dates = [...context.matchAll(/\b(20\d{2}-\d{2}-\d{2})\b/g)].map((match) => match[1]);
    const classes = [...context.matchAll(/\b(?:cod[_\s]*clase|clase)\s*[:=]?\s*([A-Za-z0-9][A-Za-z0-9._/-]*)/gi)]
      .map((match) => match[1]?.toLocaleLowerCase("es-CO"));
    if (!dates.length && !classes.length) return false;
    const compatible = matchingRefs.filter((candidate) => (
      !!candidate.identity
      && (!dates.length || dates.includes(candidate.identity.businessDate))
      && (!classes.length || classes.includes(candidate.identity.classCode.toLocaleLowerCase("es-CO")))
    ));
    return compatible.length === 1 && compatible[0]?.ref.entity_id === ref.entity_id;
  });
}

function hasExplicitNitLabel(value: string, nit: string): boolean {
  const directPattern = new RegExp(
    `\\b(?:nit|rut)\\b(?:\\s*(?:n(?:ro|[úu]mero)?\\.?))?\\s*[:#-]?\\s*${escapeRegExp(nit)}(?![\\d./-])`,
    "iu",
  );
  if (directPattern.test(value)) return true;
  const contextHasNit = /\b(?:nit|rut)\b/i.test(value);
  const nitInParens = new RegExp(`\\(\\s*${escapeRegExp(nit)}\\s*\\)`).test(value);
  const nitAsTerm = countWholeTerm(value, nit) === 1;
  return contextHasNit && (nitInParens || nitAsTerm);
}

function hasExplicitSkuLabel(context: string, sku: string): boolean {
  const pattern = new RegExp(
    `\\b(?:sku|c[oó]digo|cod|ean)\\b(?:\\s*(?:n(?:ro|[úu]mero)?\\.?))?\\s*[:#-]?\\s*${escapeRegExp(sku)}(?![\\p{L}\\p{N}_./-])`,
    "iu",
  );
  if (pattern.test(context)) return true;
  const contextHasSkuHeader = /\b(?:sku|c[oó]digo|cod|ean)\b/i.test(context);
  const skuAsTerm = countWholeTerm(context, sku) === 1;
  return contextHasSkuHeader && skuAsTerm;
}

function normalizeDiacritics(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function containsProductLabelMatch(context: string, label: string): boolean {
  if (containsWholeTerm(context, label)) return true;
  const normalizedContext = normalizeDiacritics(context);
  const normalizedLabel = normalizeDiacritics(label);
  if (containsWholeTerm(normalizedContext, normalizedLabel)) return true;
  const words = normalizedLabel
    .split(/[\s,./_-]+/)
    .map((w) => w.trim().toLocaleLowerCase("es-CO"))
    .filter((w) => w.length >= 4 && !["para", "cada", "unos", "unas", "como"].includes(w));
  if (words.length >= 2) {
    const matchedCount = words.filter((w) => containsWholeTerm(normalizedContext, w)).length;
    if (matchedCount >= 2 && matchedCount >= Math.min(words.length, 3)) return true;
  }
  return false;
}

function isAmountOrQuantityContext(context: string): boolean {
  return /\b(?:total|precio|valor|margen|costo|unidades?|cantidad|ref|saldo)\b/i.test(context);
}

function linkEntityMentions(
  value: string,
  mentions: EntityMention[],
  keyPrefix: string,
  context: string,
  purchaseContext: string,
  rowContext: string = context,
): ReactNode[] {
  if (!mentions.length || !value) return [value];
  const lowerValue = value.toLocaleLowerCase("es-CO");
  const safeContext = visibleMarkdownText(context);
  const safeRowContext = visibleMarkdownText(rowContext);
  const matches: Array<{ start: number; end: number; mention: EntityMention }> = [];

  for (const mention of mentions) {
    const term = mention.term.toLocaleLowerCase("es-CO");
    if (!term) continue;
    let searchFrom = 0;
    while (searchFrom < lowerValue.length) {
      const start = lowerValue.indexOf(term, searchFrom);
      if (start < 0) break;
      const end = start + term.length;
      const needsNameContext = mention.kind === "product-sku" && /^\d+$/.test(mention.ref.entity_id);
      const numericContextIsUnique = countWholeTerm(safeContext, mention.term) === 1;
      const notInAmountColumn = !isAmountOrQuantityContext(safeContext);
      const productSkuHasContext = mention.kind !== "product-sku"
        || (!needsNameContext && notInAmountColumn)
        || (needsNameContext
          && notInAmountColumn
          && numericContextIsUnique
          && containsWholeTerm(safeContext, mention.ref.label));
      const supplierNitHasContext = mention.kind !== "supplier-nit"
        || (numericContextIsUnique && hasExplicitNitLabel(safeContext, mention.ref.entity_id));
      const documentHasContext = mention.kind !== "purchase-document"
        || (hasExplicitDocumentLabel(safeContext, mention.term)
          && isVerifiedPurchaseDocumentMention(
          mention.ref,
          mentions.filter((candidate) => candidate.kind === "purchase-document").map((candidate) => candidate.ref),
          purchaseContext,
        ));
      if (!isWordCharacter(value[start - 1])
        && !isWordCharacter(value[end])
        && (mention.kind !== "supplier-nit" && mention.kind !== "purchase-document"
          || (!isIdentifierContinuation(value[start - 1]) && !isIdentifierContinuation(value[end])))
        && productSkuHasContext) {
        if (supplierNitHasContext && documentHasContext) matches.push({ start, end, mention });
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
        key={`${keyPrefix}-${match.mention.kind}-${match.mention.ref.entity_id}-${match.start}-${index}`}
        href={match.mention.ref.href}
        aria-label={mentionAriaLabel(match.mention)}
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

function mentionAriaLabel(mention: EntityMention): string {
  if (mention.kind === "supplier-name") return `Ver ficha de proveedor ${mention.ref.label}`;
  if (mention.kind === "supplier-nit") return `Ver ficha de proveedor NIT ${mention.ref.entity_id}`;
  if (mention.kind === "purchase-document") {
    return `Ver factura ${mention.term}`;
  }
  return `Ver ficha de ${mention.ref.label}${mention.kind === "product-sku" ? ` (${mention.ref.entity_id})` : ""}`;
}

function canLinkMarkdownEntity(
  label: string,
  ref: EntityRef,
  refs: EntityRef[],
  context: string,
  purchaseContext: string,
  rowContext: string = context,
): boolean {
  const visibleLabel = visibleMarkdownText(label).trim();
  const visibleContext = visibleMarkdownText(context);
  const visibleRowContext = visibleMarkdownText(rowContext);
  if (ref.entity_type === "purchase_document") {
    const identity = parsePurchaseDocumentEntityId(ref.entity_id);
    return !!identity
      && hasExplicitDocumentLabel(visibleContext, identity.documentNumber)
      && isVerifiedPurchaseDocumentMention(ref, refs, visibleMarkdownText(purchaseContext))
      && containsWholeTerm(visibleLabel, identity.documentNumber);
  }
  if (ref.entity_type === "supplier") {
    const matchingNames = refs.filter((candidate) => (
      candidate.entity_type === "supplier"
      && candidate.label.toLocaleLowerCase("es-CO") === ref.label.toLocaleLowerCase("es-CO")
    ));
    const canonicalName = ref.label_is_unique === true
      && matchingNames.length === 1
      && visibleLabel.toLocaleLowerCase("es-CO") === ref.label.toLocaleLowerCase("es-CO");
    const verifiedNit = containsWholeTerm(visibleLabel, ref.entity_id)
      && (hasExplicitNitLabel(visibleLabel, ref.entity_id) || hasExplicitNitLabel(visibleContext, ref.entity_id))
      && countWholeTerm(visibleContext, ref.entity_id) === 1;
    return canonicalName || verifiedNit;
  }
  if (ref.entity_type === "product") {
    const ambiguousProductName = ref.label_is_unique === false
      && visibleLabel.toLocaleLowerCase("es-CO") === ref.label.toLocaleLowerCase("es-CO");
    const isNumericSku = /^\d+$/.test(ref.entity_id);
    const mentionsNumericSkuAsLabel = isNumericSku && containsWholeTerm(visibleLabel, ref.entity_id);
    const numericSkuNeedsName = mentionsNumericSkuAsLabel
      && (isAmountOrQuantityContext(visibleContext)
        || !containsProductLabelMatch(visibleRowContext, ref.label)
        || countWholeTerm(visibleContext, ref.entity_id) !== 1);
    return !ambiguousProductName && !numericSkuNeedsName;
  }
  return true;
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
  mentions: EntityMention[] = [],
  entityRefs: EntityRef[] = [],
  context: string = value,
  purchaseContext: string = context,
  rowContext: string = context,
): ReactNode[] {
  return parseInline(value).map((part) => {
    switch (part.kind) {
      case "strong": return <strong key={part.key}>{renderInline(part.value, mentions, entityRefs, context, purchaseContext, rowContext)}</strong>;
      case "emphasis": return <em key={part.key}>{renderInline(part.value, mentions, entityRefs, context, purchaseContext, rowContext)}</em>;
      case "code": {
        const codeMention = mentions.find((mention) => (
          ["product-sku", "supplier-nit", "purchase-document"].includes(mention.kind)
          && mention.term.toLocaleLowerCase("es-CO") === part.value.toLocaleLowerCase("es-CO")
        ));
        const visibleContext = visibleMarkdownText(context);
        const visibleRowContext = visibleMarkdownText(rowContext);
        const codeMentionIsSafe = codeMention?.kind === "product-sku"
          ? (!/^\d+$/.test(codeMention.ref.entity_id)
            || (!isAmountOrQuantityContext(visibleContext)
              && containsProductLabelMatch(visibleRowContext, codeMention.ref.label)
              && countWholeTerm(visibleContext, codeMention.ref.entity_id) === 1))
          : codeMention?.kind === "supplier-nit"
            ? countWholeTerm(visibleContext, codeMention.ref.entity_id) === 1
              && hasExplicitNitLabel(visibleContext, codeMention.ref.entity_id)
            : codeMention?.kind === "purchase-document"
              ? isVerifiedPurchaseDocumentMention(
                codeMention.ref,
                entityRefs,
                visibleMarkdownText(purchaseContext),
              )
              : false;
        const code = <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-[0.9em] text-text-primary">{part.value}</code>;
        return codeMention && codeMentionIsSafe
          ? <a key={part.key} href={codeMention.ref.href} aria-label={mentionAriaLabel(codeMention)}>{code}</a>
          : <span key={part.key}>{code}</span>;
      }
      case "link": {
        const ref = entityRefs.find((item) => item.href === part.href);
        return part.href && ref && canLinkMarkdownEntity(
          part.value,
          ref,
          entityRefs,
          context,
          purchaseContext,
          rowContext,
        )
          ? <a key={part.key} href={part.href} className="font-medium text-primary underline underline-offset-2 hover:text-primary-light">{renderInline(part.value)}</a>
          : part.value;
      }
      default: return linkEntityMentions(part.value, mentions, part.key, context, purchaseContext, rowContext);
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
  mentions: EntityMention[];
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
              <th key={`th-${i}`} className="border-b border-border px-2.5 py-1.5 text-left font-semibold text-text-primary">{renderInline(cell, mentions, entityRefs, cell)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => {
            const entireRowContext = header
              .map((headerCell, column) => `${headerCell}: ${row[column] ?? ""}`)
              .join(" | ");
            const purchaseRowContext = header
              .flatMap((headerCell, column) => (
                /\b(?:factura|documento|comprobante|doc|fecha|date|clase|cod[_\s]*clase)\b/i.test(headerCell)
                  ? [`${headerCell}: ${row[column] ?? ""}`]
                  : []
              ))
              .join(" | ");
            return (
              <tr key={`tr-${ri}`} className={ri % 2 === 0 ? "bg-surface" : "bg-surface-alt/50"}>
                {row.map((cell, ci) => (
                  <td key={`td-${ri}-${ci}`} className="border-t border-border/50 px-2.5 py-1.5 text-text-secondary">
                    {renderInline(
                      cell,
                      mentions,
                      entityRefs,
                      `${header[ci] ?? ""}: ${cell}`,
                      purchaseRowContext,
                      entireRowContext,
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
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
  const mentions = assistantMentions(authorizedEntityRefs);
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
