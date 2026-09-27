"use client";

import type { ChatMessage, EntityRef, ReportAttachment } from "@/lib/api/chat";
import { parsePurchaseDocumentEntityId } from "@/lib/compras/routes";
import {
  canAccessAssistantDomain,
  isSafeAssistantEntityHref,
  isSafeServerHref,
  type AccessContext,
} from "@/lib/auth/access";
import { getStatusDescription, isAttachmentExpired } from "@/lib/api/chatView";
import { MarkdownContent } from "./MarkdownContent";
export { displayContent, getStatusDescription, isAttachmentExpired } from "@/lib/api/chatView";

function Freshness({ message }: { message: ChatMessage }): JSX.Element | null { return !message.freshness.length ? null : <div className="mt-2 border-t border-border/60 pt-2 text-[11px] text-text-muted"><p className="font-semibold text-text-secondary">Actualidad de los datos</p><ul className="mt-1 space-y-0.5">{message.freshness.map((item) => <li key={`${item.domain}-${item.cutoff_at ?? "unknown"}`}>{item.domain}: {item.status}{item.cutoff_at ? ` · corte ${item.cutoff_at}` : " · sin corte disponible"}</li>)}</ul></div>; }
function Evidence({ message }: { message: ChatMessage }): JSX.Element | null { return !message.sources.length ? null : <div className="mt-2 border-t border-border/60 pt-2 text-[11px] text-text-muted"><p className="font-semibold text-text-secondary">Evidencia</p><ul className="mt-1 space-y-0.5">{message.sources.map((source) => <li key={`${source.source_id}-${source.citation}`}>{source.citation} · {source.domain} · {source.status}{source.cutoff_at ? ` · corte ${source.cutoff_at}` : ""}</li>)}</ul></div>; }
function EntityLinks({ refs, context }: { refs: EntityRef[]; context: AccessContext }): JSX.Element | null {
  const allowed = refs.filter((ref) => (
    isSafeAssistantEntityHref(ref.entity_type, ref.entity_id, ref.domain, ref.href)
    && canAccessAssistantDomain(ref.domain, context)
  ));
  if (!allowed.length) return null;

  const productNameCounts = new Map<string, number>();
  const supplierNameCounts = new Map<string, number>();
  for (const ref of allowed) {
    const key = ref.label.toLocaleLowerCase("es-CO");
    if (ref.entity_type === "product") {
      productNameCounts.set(key, (productNameCounts.get(key) ?? 0) + 1);
    }
    if (ref.entity_type === "supplier") {
      supplierNameCounts.set(key, (supplierNameCounts.get(key) ?? 0) + 1);
    }
  }

  return (
    <div className="mt-2 flex flex-wrap gap-2 border-t border-border/60 pt-2">
      {allowed.map((ref) => {
        const ambiguousProductName = ref.entity_type === "product"
          && (ref.label_is_unique === false
            || (productNameCounts.get(ref.label.toLocaleLowerCase("es-CO")) ?? 0) > 1);
        const uniqueSupplierName = ref.entity_type === "supplier"
          && ref.label_is_unique === true
          && supplierNameCounts.get(ref.label.toLocaleLowerCase("es-CO")) === 1;
        const documentIdentity = ref.entity_type === "purchase_document"
          ? parsePurchaseDocumentEntityId(ref.entity_id)
          : null;
        const label = ref.entity_type === "supplier"
          ? uniqueSupplierName ? ref.label : `NIT ${ref.entity_id}`
          : documentIdentity
            ? `Factura ${documentIdentity.documentNumber} · ${documentIdentity.businessDate}`
            : ambiguousProductName ? `${ref.label} (${ref.entity_id})` : ref.label;
        const ariaLabel = ref.entity_type === "supplier"
          ? `Abrir ficha de proveedor ${uniqueSupplierName ? ref.label : `NIT ${ref.entity_id}`}`
          : documentIdentity
            ? `Abrir factura ${documentIdentity.documentNumber} del ${documentIdentity.businessDate}`
            : undefined;
        return (
          <a
            key={`${ref.domain}-${ref.entity_type}-${ref.entity_id}`}
            href={ref.href}
            aria-label={ariaLabel}
            className="rounded-md border border-primary/30 px-2 py-1 text-[11px] font-semibold text-primary hover:bg-primary/10"
          >
            {label}
          </a>
        );
      })}
    </div>
  );
}
function ReportCard({ attachment }: { attachment: ReportAttachment }): JSX.Element { const expired = attachment.state === "expired" || isAttachmentExpired(attachment.expires_at); const safe = isSafeServerHref(attachment.download_url); const label = attachment.format.toUpperCase(); return <div className="mt-3 rounded-lg border border-border/80 bg-surface/90 p-3"><p className="text-[10px] font-bold tracking-wider text-primary">{label} · REPORTE</p><p className="mt-1 truncate text-xs font-semibold text-text-primary" title={attachment.filename}>{attachment.filename}</p>{attachment.period_label ? <p className="mt-1 text-[11px] text-text-muted">Período: {attachment.period_label}</p> : null}{expired || !safe ? <p role="status" className="mt-2 rounded-md bg-warning/10 px-2 py-1.5 text-center text-[11px] font-medium text-warning">{expired ? "Este reporte expiró. Pedilo de nuevo en el chat." : "Este reporte no tiene un enlace autorizado."}</p> : <a href={attachment.download_url} download={attachment.filename} className="mt-2 flex justify-center rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-fg">Descargar {label}</a>}</div>; }
export function AssistantMessage({ message, context }: { message: ChatMessage; context: AccessContext }): JSX.Element { const status = getStatusDescription(message.status); return <article aria-label={`Mensaje del asistente: ${status.label}`} className="max-w-[90%] rounded-xl border border-border bg-surface-alt px-3 py-2 text-sm text-text-secondary transition-colors hover:border-border-strong sm:hover:bg-surface-alt/80">{message.status !== "complete" ? <p role="status" className={`mb-1 text-xs font-semibold ${status.tone}`}>{status.label}</p> : null}<MarkdownContent content={message.content} entityRefs={message.entity_refs} accessContext={context} /><Evidence message={message} /><Freshness message={message} /><EntityLinks refs={message.entity_refs} context={context} />{message.attachments.map((attachment) => <ReportCard key={`${attachment.filename}-${attachment.download_url}`} attachment={attachment} />)}</article>; }
