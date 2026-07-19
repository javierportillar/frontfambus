export type AdminUsersAction = "load" | "save" | "status";

export const MANAGED_USER_TENANT_ERROR = "Seleccioná al menos una empresa para este usuario.";

export function managedUserTenantError(tenants: readonly string[]): string | null {
  return tenants.length > 0 ? null : MANAGED_USER_TENANT_ERROR;
}

export function canManageAdminUser(user: { manageable: boolean }): boolean {
  return user.manageable;
}

function errorStatus(error: unknown): number | null {
  if (!(error instanceof Error)) return null;
  const match = error.message.match(/API error\s+(\d{3})/i);
  return match?.[1] ? Number(match[1]) : null;
}

/** Converts internal/upstream failures into stable, non-sensitive UI copy. */
export function adminUsersErrorMessage(error: unknown, action: AdminUsersAction): string {
  const status = errorStatus(error);
  if (status === 401 || status === 403) {
    return "Tu sesión no tiene permiso para gestionar usuarios.";
  }
  if (status === 404 || status === 502 || status === 503) {
    return "La gestión de usuarios todavía no está disponible. Reintentá en unos minutos.";
  }
  if (action === "load") return "No se pudo cargar la lista de usuarios. Intentá nuevamente.";
  if (action === "status") return "No se pudo cambiar el estado del usuario. Intentá nuevamente.";
  return "No se pudo guardar el usuario. Revisá los datos e intentá de nuevo.";
}
