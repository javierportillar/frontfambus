"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useAuthStore } from "@/lib/auth/store";
import {
  fetchDianQueueStatus,
  retryDianTransmission,
  type DianDoc,
  type DianQueueResponse,
} from "@/lib/api/dian";
import { DianStatusBadge } from "@/components/dian/DianStatusBadge";
import { Card } from "@/components/ui/Card";
import { Stat } from "@/components/ui/Stat";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";

type TabFilter = "ALL" | "ACCEPTED" | "PENDING" | "FAILED";

export default function DianConsolePage(): JSX.Element {
  const currentTenant = useAuthStore((s) => s.currentTenant) ?? "motoshop";
  const role = useAuthStore((s) => s.role);
  const canRetry = role === "admin" || role === "gerente";

  const [queueData, setQueueData] = useState<DianQueueResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<TabFilter>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Reintento en curso por sale_id
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Modal XML
  const [selectedXmlDoc, setSelectedXmlDoc] = useState<DianDoc | null>(null);
  const [copiedCufeId, setCopiedCufeId] = useState<string | null>(null);
  const [copiedXml, setCopiedXml] = useState<boolean>(false);

  // Carga inicial y recarga
  const loadQueue = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const data = await fetchDianQueueStatus(undefined, currentTenant);
      setQueueData(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Error conectando con la pasarela de facturación electrónica DIAN.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentTenant]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  // Manejador de reintento
  async function handleRetry(doc: DianDoc): Promise<void> {
    if (!canRetry) {
      setNotification({
        type: "error",
        message: "Solo administradores y gerentes pueden reintentar transmisiones DIAN.",
      });
      return;
    }

    setRetryingId(doc.sale_id);
    setNotification(null);

    try {
      const updated = await retryDianTransmission(doc.sale_id, false, currentTenant);
      setNotification({
        type: "success",
        message: `Transmisión reintentada para factura ${doc.doc_number}. Nuevo estado: ${updated.status}.`,
      });
      // Recargar cola
      await loadQueue(true);
    } catch (err) {
      setNotification({
        type: "error",
        message:
          err instanceof Error
            ? err.message
            : `Error al reintentar factura ${doc.doc_number}.`,
      });
    } finally {
      setRetryingId(null);
    }
  }

  // Copiar al portapapeles
  async function handleCopy(text: string, id: string): Promise<void> {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setCopiedCufeId(id);
        setTimeout(() => setCopiedCufeId(null), 2500);
      }
    } catch {
      // Ignorar fallback
    }
  }

  // Filtrado de documentos
  const filteredDocuments = useMemo(() => {
    if (!queueData?.documents) return [];

    let docs = queueData.documents;

    if (activeTab === "ACCEPTED") {
      docs = docs.filter((d) => d.status === "ACCEPTED");
    } else if (activeTab === "PENDING") {
      docs = docs.filter((d) => d.status === "PENDING" || d.status === "SENDING");
    } else if (activeTab === "FAILED") {
      docs = docs.filter((d) => d.status === "FAILED" || d.status === "REJECTED");
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      docs = docs.filter(
        (d) =>
          d.doc_number.toLowerCase().includes(q) ||
          d.sale_id.toLowerCase().includes(q) ||
          (d.cufe && d.cufe.toLowerCase().includes(q)),
      );
    }

    return docs;
  }, [queueData, activeTab, searchQuery]);

  // UBL XML generator para inspección
  function getUblXmlContent(doc: DianDoc): string {
    const cufe =
      doc.cufe ||
      "000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
    const dateStr = doc.accepted_at || doc.sent_at || new Date().toISOString();
    const issueDate = dateStr.slice(0, 10);
    const issueTime = dateStr.slice(11, 19) || "12:00:00";

    return `<?xml version="1.0" encoding="UTF-8"?>
<AttachedDocument xmlns="urn:oasis:names:specification:ubl:schema:xsd:AttachedDocument-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:UBLVersionID>UBL 2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>10</cbc:CustomizationID>
  <cbc:ProfileID>DIAN 2.1: Factura Electrónica de Venta</cbc:ProfileID>
  <cbc:ID>${doc.doc_number}</cbc:ID>
  <cbc:IssueDate>${issueDate}</cbc:IssueDate>
  <cbc:IssueTime>${issueTime}-05:00</cbc:IssueTime>
  <cbc:DocumentTypeCode>01</cbc:DocumentTypeCode>
  <Invoice>
    <ID>${doc.doc_number}</ID>
    <UUID schemeName="CUFE-SHA384">${cufe}</UUID>
    <IssueDate>${issueDate}</IssueDate>
    <Status>${doc.status}</Status>
    <TrackId>${doc.track_id || `track-${cufe.slice(0, 16)}`}</TrackId>
    <StatusCodeDIAN>${doc.estfele ?? 1}</StatusCodeDIAN>
  </Invoice>
</AttachedDocument>`;
  }

  function handleDownloadXml(doc: DianDoc): void {
    const xml = getUblXmlContent(doc);
    const blob = new Blob([xml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `DIAN-${doc.doc_number}.xml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const counts = {
    total: queueData?.total ?? 0,
    accepted: queueData?.accepted ?? 0,
    pending: queueData?.pending ?? 0,
    failed: (queueData?.failed ?? 0) + (queueData?.rejected ?? 0),
  };

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      {/* ─── Cabecera de la Consola ──────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-text-primary">
              Consola de Facturación Electrónica DIAN
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              VPFE Activo
            </span>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-text-secondary">
            Monitoreo en tiempo real, auditoría UBL y reintento de comprobantes fiscales para{" "}
            <span className="font-semibold text-text-primary uppercase tracking-wide">
              {currentTenant}
            </span>
            .
          </p>
        </div>

        {/* Acciones de Cabecera */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => loadQueue(true)}
            disabled={refreshing || loading}
            aria-label="Actualizar cola DIAN"
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-xs font-bold text-text-secondary shadow-xs hover:bg-surface-alt hover:text-text-primary transition-all disabled:opacity-50"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className={`h-4 w-4 ${refreshing ? "animate-spin text-primary" : ""}`}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            <span>{refreshing ? "Sincronizando..." : "Actualizar"}</span>
          </button>
        </div>
      </div>

      {/* ─── Banner de Notificación ──────────────────────────────── */}
      {notification && (
        <div
          role="status"
          aria-live="polite"
          className={`flex items-center justify-between rounded-xl px-4 py-3 text-xs font-semibold shadow-xs ${
            notification.type === "success"
              ? "bg-emerald-500/10 text-emerald-800 border border-emerald-500/30 dark:text-emerald-300"
              : "bg-rose-500/10 text-rose-800 border border-rose-500/30 dark:text-rose-300"
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === "success" ? (
              <svg className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="h-4 w-4 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            )}
            <span>{notification.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotification(null)}
            className="text-text-muted hover:text-text-primary text-sm font-bold ml-2"
          >
            ×
          </button>
        </div>
      )}

      {/* ─── 4 KPI Summary Cards ─────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Documentos */}
        <Card className="p-4 bg-surface border-border hover:border-primary/40 transition-all">
          <Stat
            label="Total Documentos"
            value={loading ? "..." : counts.total.toString()}
            subtitle="Emitidos por Punto de Venta"
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            }
          />
        </Card>

        {/* Aceptadas por DIAN */}
        <Card className="p-4 bg-surface border-border hover:border-emerald-500/40 transition-all">
          <Stat
            label="Aceptadas por DIAN"
            value={loading ? "..." : counts.accepted.toString()}
            subtitle="Con CUFE y QR válido"
            className="text-emerald-600"
            icon={
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            }
          />
        </Card>

        {/* En Cola / Pendientes */}
        <Card className="p-4 bg-surface border-border hover:border-sky-500/40 transition-all">
          <Stat
            label="En Cola / Pendientes"
            value={loading ? "..." : counts.pending.toString()}
            subtitle="Procesamiento asíncrono"
            icon={
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            }
          />
        </Card>

        {/* Con Error de Envío */}
        <Card className="p-4 bg-surface border-border hover:border-rose-500/40 transition-all">
          <Stat
            label="Con Error de Envío"
            value={loading ? "..." : counts.failed.toString()}
            subtitle="Requiere reintento o revisión"
            icon={
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-500/10 text-rose-600">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
              </div>
            }
          />
        </Card>
      </div>

      {/* ─── Filtros y Búsqueda ─────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-surface p-3 rounded-2xl border border-border shadow-2xs">
        {/* Pestañas de Filtro */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "ALL"}
            onClick={() => setActiveTab("ALL")}
            className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all ${
              activeTab === "ALL"
                ? "bg-primary text-primary-fg shadow-xs"
                : "text-text-secondary hover:bg-surface-alt hover:text-text-primary"
            }`}
          >
            <span>Todas</span>
            <span className="rounded-full bg-black/10 dark:bg-white/10 px-1.5 py-0.2 text-[0.6875rem]">
              {counts.total}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "ACCEPTED"}
            onClick={() => setActiveTab("ACCEPTED")}
            className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all ${
              activeTab === "ACCEPTED"
                ? "bg-emerald-600 text-white shadow-xs"
                : "text-text-secondary hover:bg-surface-alt hover:text-text-primary"
            }`}
          >
            <span>Aceptadas</span>
            <span className="rounded-full bg-black/10 dark:bg-white/10 px-1.5 py-0.2 text-[0.6875rem]">
              {counts.accepted}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "PENDING"}
            onClick={() => setActiveTab("PENDING")}
            className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all ${
              activeTab === "PENDING"
                ? "bg-sky-600 text-white shadow-xs"
                : "text-text-secondary hover:bg-surface-alt hover:text-text-primary"
            }`}
          >
            <span>Pendientes</span>
            <span className="rounded-full bg-black/10 dark:bg-white/10 px-1.5 py-0.2 text-[0.6875rem]">
              {counts.pending}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "FAILED"}
            onClick={() => setActiveTab("FAILED")}
            className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all ${
              activeTab === "FAILED"
                ? "bg-rose-600 text-white shadow-xs"
                : "text-text-secondary hover:bg-surface-alt hover:text-text-primary"
            }`}
          >
            <span>Con Error</span>
            <span className="rounded-full bg-black/10 dark:bg-white/10 px-1.5 py-0.2 text-[0.6875rem]">
              {counts.failed}
            </span>
          </button>
        </div>

        {/* Input de Búsqueda */}
        <div className="relative w-full sm:w-72">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className="absolute left-3 top-2.5 h-4 w-4 text-text-muted"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por # factura, CUFE..."
            className="w-full rounded-xl border border-border bg-surface-alt pl-9 pr-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      {/* ─── Tabla de Documentos ─────────────────────────────────── */}
      {error ? (
        <ErrorState
          title="Error al cargar la cola de facturación DIAN"
          message={error}
          action={
            <button
              type="button"
              onClick={() => loadQueue(false)}
              className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-fg hover:bg-primary-dark"
            >
              Reintentar Conexión
            </button>
          }
        />
      ) : loading ? (
        <div className="rounded-2xl border border-border bg-surface p-12 text-center">
          <div className="inline-flex items-center justify-center p-3 rounded-full bg-primary/10 text-primary mb-3">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-6 w-6 animate-spin">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
          </div>
          <p className="text-sm font-bold text-text-primary">Consultando pasarela DIAN...</p>
          <p className="text-xs text-text-muted mt-1">Verificando estado de documentos y colas de sincronización.</p>
        </div>
      ) : filteredDocuments.length === 0 ? (
        <EmptyState
          title="No hay comprobantes para mostrar"
          description={
            searchQuery
              ? `No se encontraron resultados para la búsqueda "${searchQuery}".`
              : "No se registran documentos en el filtro seleccionado."
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-xs">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-border bg-surface-alt/70 text-text-secondary font-bold uppercase tracking-wider text-[0.6875rem]">
                <th className="py-3 px-4">Número de Factura</th>
                <th className="py-3 px-4">Fecha / Hora</th>
                <th className="py-3 px-4">Estado</th>
                <th className="py-3 px-4">CUFE</th>
                <th className="py-3 px-4 text-center">Reintentos</th>
                <th className="py-3 px-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredDocuments.map((doc) => {
                const formattedDate = doc.sent_at || doc.accepted_at
                  ? new Date(doc.sent_at || doc.accepted_at || "").toLocaleString("es-CO", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })
                  : "—";

                const isFailed = doc.status === "FAILED" || doc.status === "REJECTED";
                const isItemRetrying = retryingId === doc.sale_id;

                return (
                  <tr
                    key={doc.sale_id}
                    className="hover:bg-surface-alt/40 transition-colors"
                  >
                    {/* Número de Factura */}
                    <td className="py-3 px-4">
                      <div className="font-bold text-text-primary">{doc.doc_number}</div>
                      <div className="text-[0.6875rem] text-text-muted font-mono truncate max-w-[140px]" title={doc.sale_id}>
                        {doc.sale_id}
                      </div>
                    </td>

                    {/* Fecha / Hora */}
                    <td className="py-3 px-4 text-text-secondary whitespace-nowrap">
                      {formattedDate}
                    </td>

                    {/* Estado DIAN */}
                    <td className="py-3 px-4">
                      <div className="flex flex-col gap-1 items-start">
                        <DianStatusBadge status={doc.status} size="sm" />
                        {doc.error_message && (
                          <span
                            className="text-[0.6875rem] text-rose-600 line-clamp-1 max-w-[200px]"
                            title={doc.error_message}
                          >
                            {doc.error_message}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* CUFE */}
                    <td className="py-3 px-4">
                      {doc.cufe ? (
                        <div className="flex items-center gap-1.5">
                          <code
                            className="font-mono text-[0.6875rem] text-text-primary bg-surface-alt px-1.5 py-0.5 rounded border border-border/80"
                            title={doc.cufe}
                          >
                            {doc.cufe.slice(0, 8)}...{doc.cufe.slice(-6)}
                          </code>

                          {/* Copiar CUFE */}
                          <button
                            type="button"
                            onClick={() => handleCopy(doc.cufe || "", doc.sale_id)}
                            aria-label="Copiar CUFE"
                            title="Copiar CUFE completo"
                            className="rounded p-1 text-text-muted hover:bg-surface-alt hover:text-text-primary transition-colors"
                          >
                            {copiedCufeId === doc.sale_id ? (
                              <svg className="h-3.5 w-3.5 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                              </svg>
                            ) : (
                              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9 9 9 0 00-9 9v1.5m15 4.5H9a2.25 2.25 0 01-2.25-2.25V9a2.25 2.25 0 012.25-2.25h6.75A2.25 2.25 0 0118 9v6a2.25 2.25 0 01-2.25 2.25z" />
                              </svg>
                            )}
                          </button>

                          {/* Enlace al catálogo VPFE */}
                          <a
                            href={`https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=${doc.cufe}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="Verificar en catálogo DIAN"
                            title="Consultar en catálogo VPFE de la DIAN"
                            className="rounded p-1 text-text-muted hover:bg-surface-alt hover:text-primary transition-colors"
                          >
                            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                            </svg>
                          </a>
                        </div>
                      ) : (
                        <span className="text-text-muted italic text-[0.6875rem]">
                          Pendiente de emisión
                        </span>
                      )}
                    </td>

                    {/* Reintentos */}
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[0.6875rem] font-bold ${
                          doc.retry_count > 0
                            ? "bg-amber-500/10 text-amber-800 dark:text-amber-300"
                            : "bg-surface-alt text-text-muted"
                        }`}
                      >
                        {doc.retry_count}
                      </span>
                    </td>

                    {/* Acciones */}
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        {/* Botón Reintentar */}
                        <button
                          type="button"
                          onClick={() => handleRetry(doc)}
                          disabled={!isFailed || !canRetry || isItemRetrying}
                          title={
                            !canRetry
                              ? "Solo administradores y gerentes pueden reintentar"
                              : !isFailed
                                ? "Solo se pueden reintentar documentos fallidos o rechazados"
                                : "Reintentar transmisión ante DIAN"
                          }
                          className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                            isFailed && canRetry
                              ? "bg-rose-500/10 text-rose-700 hover:bg-rose-500/20 active:scale-95"
                              : "opacity-40 cursor-not-allowed bg-surface-alt text-text-muted"
                          }`}
                        >
                          {isItemRetrying ? (
                            <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                            </svg>
                          ) : (
                            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                            </svg>
                          )}
                          <span>Reintentar</span>
                        </button>

                        {/* Botón Ver XML */}
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedXmlDoc(doc);
                            setCopiedXml(false);
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-bold text-text-secondary hover:bg-surface-alt hover:text-text-primary transition-all"
                        >
                          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
                          </svg>
                          <span>Ver XML</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── Modal Visor de XML UBL ──────────────────────────────── */}
      <Modal
        isOpen={selectedXmlDoc !== null}
        onClose={() => setSelectedXmlDoc(null)}
        title={
          selectedXmlDoc
            ? `Inspección UBL 2.1 — ${selectedXmlDoc.doc_number}`
            : "Inspección XML"
        }
        maxWidth="max-w-4xl"
      >
        {selectedXmlDoc && (
          <div className="space-y-4">
            {/* Metadata Header */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-surface-alt rounded-xl border border-border text-xs">
              <div>
                <span className="font-bold text-text-primary">Factura: </span>
                <span>{selectedXmlDoc.doc_number}</span>
              </div>
              <div>
                <span className="font-bold text-text-primary">Estado: </span>
                <DianStatusBadge status={selectedXmlDoc.status} size="sm" />
              </div>
              <div className="truncate max-w-xs font-mono text-[0.6875rem]">
                <span className="font-bold font-sans text-text-primary">CUFE: </span>
                {selectedXmlDoc.cufe || "No asignado"}
              </div>
            </div>

            {/* XML Raw Editor / Viewer */}
            <div className="relative">
              <pre className="font-mono text-xs bg-neutral-900 text-neutral-100 p-4 rounded-xl overflow-x-auto max-h-[50vh] leading-relaxed border border-neutral-800">
                <code>{getUblXmlContent(selectedXmlDoc)}</code>
              </pre>
            </div>

            {/* Acciones del Modal */}
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <span className="text-[0.6875rem] text-text-muted">
                Documento AttachedDocument UBL versión 2.1 conforme anexo técnico DIAN.
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    const xml = getUblXmlContent(selectedXmlDoc);
                    if (navigator?.clipboard?.writeText) {
                      await navigator.clipboard.writeText(xml);
                      setCopiedXml(true);
                      setTimeout(() => setCopiedXml(false), 2000);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-bold text-text-primary hover:bg-surface-alt transition-all"
                >
                  {copiedXml ? (
                    <>
                      <svg className="h-3.5 w-3.5 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                      <span>¡Copiado!</span>
                    </>
                  ) : (
                    <>
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9 9 9 0 00-9 9v1.5m15 4.5H9a2.25 2.25 0 01-2.25-2.25V9a2.25 2.25 0 012.25-2.25h6.75A2.25 2.25 0 0118 9v6a2.25 2.25 0 01-2.25 2.25z" />
                      </svg>
                      <span>Copiar XML</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => handleDownloadXml(selectedXmlDoc)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-bold text-primary-fg hover:bg-primary-dark transition-all"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                  <span>Descargar .xml</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
