/**
 * Helpers para sincronizar el tenant seleccionado con una cookie accesible
 * desde el middleware de Next.js.
 *
 * El middleware corre en el servidor (Edge Runtime) y no tiene acceso a
 * localStorage/Zustand. La cookie `motoshop_tenant` es el puente: se setea
 * desde el cliente cuando el usuario selecciona un tenant y se limpia al
 * hacer logout.
 */

const TENANT_COOKIE = "motoshop_tenant";
const COOKIE_PATH = "/";
// 30 días en segundos
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60;

export function setTenantCookie(tenant: string): void {
  if (typeof document === "undefined") return;
  document.cookie = `${TENANT_COOKIE}=${encodeURIComponent(tenant)}; path=${COOKIE_PATH}; max-age=${COOKIE_MAX_AGE}; SameSite=Lax; secure`;
}

export function clearTenantCookie(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${TENANT_COOKIE}=; path=${COOKIE_PATH}; max-age=0; SameSite=Lax; secure`;
}
