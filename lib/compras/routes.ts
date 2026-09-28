export interface PurchaseDocumentIdentity {
  businessDate: string;
  classCode: string;
  documentNumber: string;
}

export function isValidBusinessDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year = 0, month = 1, day = 1] = value.split("-").map(Number);
  if (year < 1) return false;
  const parsed = new Date(0);
  parsed.setUTCHours(0, 0, 0, 0);
  parsed.setUTCFullYear(year, month - 1, day);
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

export function isValidSupplierNit(value: string): boolean {
  return /^(?:\d{6,14}|\d{1,3}(?:\.\d{3}){2,4})(?:-\d{1,2})?$/.test(value);
}

export function parsePurchaseDocumentEntityId(entityId: string): PurchaseDocumentIdentity | null {
  const parts = entityId.split("|");
  if (parts.length !== 3) return null;
  const [businessDate, classCode, documentNumber] = parts;
  if (!businessDate || !isValidBusinessDate(businessDate)
    || !classCode || classCode.length > 40
    || !documentNumber || documentNumber.length > 120
    || !/^[A-Za-z0-9._:/-]+$/.test(classCode + documentNumber)
    || documentNumber.split("/").some((part) => part === "." || part === "..")) return null;
  return { businessDate, classCode, documentNumber };
}

export function purchaseDocumentHref(
  businessDate: string,
  classCode: string,
  documentNumber: string,
): string {
  return `/dashboards/compras/dia/${encodeURIComponent(businessDate)}`
    + `/documento/${encodeURIComponent(documentNumber)}`
    + `?cod_clase=${encodeURIComponent(classCode)}`;
}

export function purchaseDocumentHrefFromEntityId(entityId: string): string | null {
  const identity = parsePurchaseDocumentEntityId(entityId);
  return identity
    ? purchaseDocumentHref(identity.businessDate, identity.classCode, identity.documentNumber)
    : null;
}

export function supplierProfileHref(nit: string): string {
  return `/dashboards/compras/proveedores/${encodeURIComponent(nit)}`;
}
