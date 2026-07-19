import { describe, expect, it } from "vitest";
import { authPersistedState } from "./store";

describe("auth persistence", () => {
  it("persists allowed modules but requires /auth/me before considering permissions ready", () => {
    const persisted = authPersistedState({
      user: "javier",
      role: "gerente",
      isAuthenticated: true,
      currentTenant: "motoshop",
      availableTenants: ["motoshop"],
      enabledFeatures: ["analisis", "forecast"],
      allowedModules: ["analisis"],
      returnUrl: null,
    });

    expect(persisted.allowedModules).toEqual(["analisis"]);
    expect(persisted).not.toHaveProperty("permissionsReady");
  });
});
