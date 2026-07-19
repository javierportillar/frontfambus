import { describe, expect, it } from "vitest";
import {
  adminUsersErrorMessage,
  canManageAdminUser,
  managedUserTenantError,
} from "./users";

describe("admin user errors", () => {
  it("does not expose upstream service names or raw response bodies", () => {
    const message = adminUsersErrorMessage(
      new Error('API error 404 on /api/admin/users: {"detail":"Error en Supabase (users get): 404"}'),
      "load",
    );

    expect(message).toBe("La gestión de usuarios todavía no está disponible. Reintentá en unos minutos.");
    expect(message).not.toMatch(/supabase|detail|users get/i);
  });

  it("provides a safe generic mutation error", () => {
    expect(adminUsersErrorMessage(new Error("secret backend failure"), "save")).toBe(
      "No se pudo guardar el usuario. Revisá los datos e intentá de nuevo.",
    );
  });
});

describe("managed user form contract", () => {
  it("requires at least one tenant for create and edit submissions", () => {
    expect(managedUserTenantError([])).toBe("Seleccioná al menos una empresa para este usuario.");
    expect(managedUserTenantError(["motoshop"])).toBeNull();
  });

  it("keeps legacy identities read-only", () => {
    expect(canManageAdminUser({ manageable: false })).toBe(false);
    expect(canManageAdminUser({ manageable: true })).toBe(true);
  });
});
