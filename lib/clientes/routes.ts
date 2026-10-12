/**
 * Customer identifier is an opaque, encoded path segment — never assume a
 * numeric NIT. The backend accepts any non-control value up to 64 chars; the
 * frontend mirrors that bound and additionally rejects path-traversal tokens.
 */
export const MAX_CUSTOMER_ID_LENGTH = 64;

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

export function isValidCustomerId(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_CUSTOMER_ID_LENGTH) return false;
  if (CONTROL_CHARS.test(trimmed)) return false;
  if (trimmed === "." || trimmed === "..") return false;
  return true;
}

export function customerProfileHref(customerId: string): string {
  return `/dashboards/clientes/${encodeURIComponent(customerId)}`;
}

export function salesDayHref(businessDate: string): string {
  return `/dashboards/ventas/dia/${encodeURIComponent(businessDate)}`;
}

export function productHref(sku: string): string {
  return `/dashboards/productos/${encodeURIComponent(sku)}`;
}
