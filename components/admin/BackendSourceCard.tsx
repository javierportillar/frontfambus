"use client";

import { useBackendStatus } from "@/lib/api/hooks";
import { useAuthStore } from "@/lib/auth/store";
import { getTenantDisplay } from "@/lib/tenant/config";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import type { ClusterNodeStatus } from "@/lib/api/backendFailover";

function NodeIcon({ id }: { id: string }): JSX.Element {
  if (id === "render") {
    // Cloud icon for Render
    return (
      <svg
        className="h-5 w-5 text-accent"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.8}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 15a4 4 0 004 4h10a4 4 0 003.82-5.2A4.5 4.5 0 0017 5a4.49 4.49 0 00-3.5 1.7A4 4 0 007 9a4.01 4.01 0 00-4 4c0 .34.04.67.12 1"
        />
      </svg>
    );
  }
  // Desktop/Server hardware icon for local nodes
  return (
    <svg
      className="h-5 w-5 text-text-primary"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.8}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 17v2m6-2v2M4 5h16a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1zm5 7h.01M15 12h.01"
      />
    </svg>
  );
}

function getNodeDisplayStatus(node: ClusterNodeStatus): {
  label: string;
  badgeVariant: "success" | "warning" | "default" | "error";
  dotColor: string;
} {
  if (node.status === "online") {
    const label = node.id === "render" ? "Online" : "Online [DuckDB]";
    return {
      label,
      badgeVariant: "success",
      dotColor: "bg-success",
    };
  }
  if (node.status === "suspended") {
    const code = node.statusCode ? ` [${node.statusCode}]` : " [503]";
    return {
      label: `Suspendido${code}`,
      badgeVariant: "warning",
      dotColor: "bg-warning",
    };
  }
  return {
    label: "Offline",
    badgeVariant: "default",
    dotColor: "bg-text-muted/40",
  };
}

function formatUrlHost(url: string): string {
  try {
    return url.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  } catch {
    return url;
  }
}

function formatTime(iso: string | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("es-CO", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function BackendSourceCard(): JSX.Element {
  const { data, error, isLoading, isValidating, mutate } = useBackendStatus();
  const currentTenantSlug = useAuthStore((s) => s.currentTenant) ?? data?.currentTenant ?? "motoshop";
  const tenantDisplay = getTenantDisplay(currentTenantSlug);

  if (isLoading && !data) {
    return (
      <Card variant="default" hover={false} className="border-border">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
            <div className="flex items-center gap-2">
              <Skeleton className="h-6 w-6 rounded-full" />
              <Skeleton className="h-5 w-64 rounded-md" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-8 w-24 rounded-lg" />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="rounded-lg border border-border bg-surface-alt/60 p-3.5 space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-28 rounded" />
                  <Skeleton className="h-4 w-12 rounded-full" />
                </div>
                <Skeleton className="h-3 w-40 rounded" />
                <div className="flex items-center justify-between pt-1">
                  <Skeleton className="h-5 w-24 rounded-full" />
                  <Skeleton className="h-3 w-12 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>
    );
  }

  const activeNode = data?.activeNode;
  const nodes = data?.nodes ?? [];
  const checkedAtTime = formatTime(data?.checkedAt);

  return (
    <Card variant="default" hover={false} className="border-border bg-surface shadow-sm">
      <div className="space-y-4">
        {/* Top Header: Active Root Banner & Refresh Controls */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-3">
          <div className="flex flex-wrap items-center gap-2.5">
            {activeNode ? (
              <span className="flex h-3 w-3 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-success" />
              </span>
            ) : (
              <span className="inline-flex rounded-full h-3 w-3 bg-error" />
            )}

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-text-primary">
                {activeNode ? (
                  <>
                    Conectado activamente a:{" "}
                    <span className="text-text-primary underline decoration-accent decoration-2 underline-offset-4">
                      {activeNode.name}
                    </span>
                  </>
                ) : (
                  <span className="text-error">Sin conexión activa al cluster</span>
                )}
              </span>

              {/* Active Tenant Badge */}
              <Badge
                variant="default"
                size="sm"
                className="border border-border font-medium"
              >
                {tenantDisplay?.name ?? currentTenantSlug}
              </Badge>
            </div>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-3 text-xs text-text-muted">
            {data?.checkedAt && (
              <span className="font-mono text-[0.6875rem]">
                Comprobado: {checkedAtTime}
              </span>
            )}
            <button
              type="button"
              onClick={() => mutate()}
              disabled={isValidating}
              title="Actualizar estado de conexión"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-alt px-2.5 py-1 text-xs font-medium text-text-primary transition-colors hover:bg-surface-alt/80 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <svg
                className={`h-3.5 w-3.5 text-text-secondary ${
                  isValidating ? "animate-spin text-accent" : ""
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              <span>{isValidating ? "Comprobando..." : "Actualizar"}</span>
            </button>
          </div>
        </div>

        {error && !data && (
          <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs text-warning">
            No se pudo consultar el estado del cluster en este momento. Revisa la conexión de red.
          </div>
        )}

        {/* 3-Column Cluster Nodes Grid */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {nodes.map((node) => {
            const statusInfo = getNodeDisplayStatus(node);
            const host = formatUrlHost(node.url);

            return (
              <div
                key={node.id}
                className={`relative flex flex-col justify-between rounded-xl border p-3.5 transition-all ${
                  node.isActive
                    ? "border-success/40 bg-success/[0.03] ring-1 ring-success/20 shadow-sm"
                    : "border-border bg-surface-alt/40"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2">
                      <NodeIcon id={node.id} />
                      <span className="text-sm font-semibold text-text-primary">
                        {node.name}
                      </span>
                    </div>

                    {node.isActive && (
                      <Badge variant="success" size="sm" className="font-semibold">
                        Activo
                      </Badge>
                    )}
                  </div>

                  <p className="font-mono text-xs text-text-muted truncate mb-3" title={node.url}>
                    {host}
                  </p>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-border/60">
                  <div className="flex items-center gap-1.5">
                    <span className={`inline-block h-2 w-2 rounded-full ${statusInfo.dotColor}`} />
                    <Badge variant={statusInfo.badgeVariant} size="sm">
                      {statusInfo.label}
                    </Badge>
                  </div>

                  <div className="text-xs text-text-muted font-mono">
                    {node.latencyMs != null ? `${node.latencyMs} ms` : "—"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
