export type ExpiryBand = "expired" | "critical" | "warning" | "normal";

export interface ExpiryBandInfo {
  band: ExpiryBand;
  label: string;
  className: string;
}

/**
 * Business bands are inclusive: an item expiring today is critical, while a
 * past date is expired. Keeping this pure makes the policy easy to test.
 */
export function getExpiryBand(daysUntilExpiry: number): ExpiryBandInfo {
  if (daysUntilExpiry < 0) {
    return { band: "expired", label: "Vencido", className: "bg-red-100 text-red-800" };
  }
  if (daysUntilExpiry <= 30) {
    return { band: "critical", label: "Crítico ≤ 30 días", className: "bg-orange-100 text-orange-800" };
  }
  if (daysUntilExpiry <= 90) {
    return { band: "warning", label: "Atención ≤ 90 días", className: "bg-amber-100 text-amber-800" };
  }
  return { band: "normal", label: "Vigente", className: "bg-emerald-100 text-emerald-800" };
}

/** Calendar-day difference avoids timezone changes turning today into yesterday. */
export function daysUntilExpiry(expiresOn: string, today = new Date()): number {
  const [year, month, day] = expiresOn.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return 0;
  const expiryUtc = Date.UTC(year, month - 1, day);
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((expiryUtc - todayUtc) / 86_400_000);
}

export function formatExpiryDate(value: string): string {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}
