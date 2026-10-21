"use client";

import type { DianStatus } from "@/lib/api/dian";

export interface DianStatusBadgeProps {
  status: DianStatus | string;
  className?: string;
  showIcon?: boolean;
  size?: "sm" | "md";
}

interface StatusConfig {
  label: string;
  badgeStyle: string;
  icon: JSX.Element;
  dotPulse?: boolean;
}

const STATUS_CONFIGS: Record<string, StatusConfig> = {
  ACCEPTED: {
    label: "Aceptada DIAN",
    badgeStyle: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:bg-emerald-500/20 dark:text-emerald-300",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        className="h-3.5 w-3.5 shrink-0"
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
      </svg>
    ),
  },
  SENDING: {
    label: "Transmitiendo...",
    badgeStyle: "bg-blue-500/10 text-blue-700 border-blue-500/30 dark:bg-blue-500/20 dark:text-blue-300 animate-pulse",
    dotPulse: true,
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.2}
        className="h-3.5 w-3.5 shrink-0 animate-spin"
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
      </svg>
    ),
  },
  PENDING: {
    label: "En Cola DIAN",
    badgeStyle: "bg-sky-500/10 text-sky-700 border-sky-500/30 dark:bg-sky-500/20 dark:text-sky-300",
    dotPulse: true,
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.2}
        className="h-3.5 w-3.5 shrink-0"
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  FAILED: {
    label: "Error Transmisión",
    badgeStyle: "bg-rose-500/10 text-rose-700 border-rose-500/30 dark:bg-rose-500/20 dark:text-rose-300",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.2}
        className="h-3.5 w-3.5 shrink-0"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
        />
      </svg>
    ),
  },
  REJECTED: {
    label: "Rechazada DIAN",
    badgeStyle: "bg-amber-500/10 text-amber-800 border-amber-500/30 dark:bg-amber-500/20 dark:text-amber-300",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.2}
        className="h-3.5 w-3.5 shrink-0"
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  CANCELLED: {
    label: "Cancelada",
    badgeStyle: "bg-neutral-500/10 text-neutral-600 border-neutral-500/30 dark:bg-neutral-500/20 dark:text-neutral-400",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        className="h-3.5 w-3.5 shrink-0"
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
      </svg>
    ),
  },
};

const DEFAULT_CONFIG: StatusConfig = {
  label: "Desconocido",
  badgeStyle: "bg-neutral-100 text-neutral-600 border-neutral-200 dark:bg-neutral-800 dark:text-neutral-400",
  icon: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      className="h-3.5 w-3.5 shrink-0"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4M12 16h.01" />
    </svg>
  ),
};

export function DianStatusBadge({
  status,
  className = "",
  showIcon = true,
  size = "md",
}: DianStatusBadgeProps): JSX.Element {
  const normalizedKey = (status || "").toUpperCase();
  const config = STATUS_CONFIGS[normalizedKey] || DEFAULT_CONFIG;

  const sizeClasses =
    size === "sm"
      ? "px-2 py-0.5 text-[0.6875rem] gap-1"
      : "px-2.5 py-1 text-xs gap-1.5";

  return (
    <span
      className={`inline-flex items-center font-semibold rounded-full border shadow-2xs whitespace-nowrap ${sizeClasses} ${config.badgeStyle} ${className}`}
      title={`Estado DIAN: ${config.label}`}
    >
      {showIcon && config.icon}
      <span>{config.label}</span>
    </span>
  );
}
