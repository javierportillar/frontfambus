"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { setTenantCookie, clearTenantCookie } from "../tenant/store";

interface AuthState {
  user: string | null;
  role: string | null;
  isAuthenticated: boolean;
  hasHydrated: boolean;
  /** True only after the current tenant's /auth/me response was applied. */
  permissionsReady: boolean;
  setUser: (user: string, role: string) => void;
  logout: () => void;
  setHasHydrated: (v: boolean) => void;
  hydrateSession: (session: {
    username: string;
    role: string;
    tenantsAllowed: string[];
    currentTenant: string;
    enabledFeatures: string[];
    allowedModules: string[] | null;
  }) => void;

  // ---- Session ----
  returnUrl: string | null;           // URL a la que volver tras login
  setReturnUrl: (url: string | null) => void;

  // ---- Multi-tenant (M2) ----
  currentTenant: string | null;
  availableTenants: string[];
  enabledFeatures: string[];
  setTenant: (tenant: string, features: string[]) => void;
  setAvailableTenants: (tenants: string[]) => void;
  clearTenant: () => void;

  // ---- RBAC per-user modules ----
  // null = sin restricción (admin / usuario heredado). Lista = restringe la nav.
  allowedModules: string[] | null;
  setAllowedModules: (modules: string[] | null) => void;
}

type PersistableAuthState = Pick<
  AuthState,
  | "user"
  | "role"
  | "isAuthenticated"
  | "currentTenant"
  | "availableTenants"
  | "enabledFeatures"
  | "allowedModules"
  | "returnUrl"
>;

export function authPersistedState(state: PersistableAuthState): PersistableAuthState {
  return {
    user: state.user,
    role: state.role,
    isAuthenticated: state.isAuthenticated,
    currentTenant: state.currentTenant,
    availableTenants: state.availableTenants,
    enabledFeatures: state.enabledFeatures,
    allowedModules: state.allowedModules,
    returnUrl: state.returnUrl,
  };
}

// F7-FIX1 bug 5.1: persistir auth en localStorage para que el refresh no rompa el home
// y el rol se mantenga entre navegaciones. hasHydrated evita renderizar contenido
// dependiente del rol antes de que Zustand restaure desde storage.
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      role: null,
      isAuthenticated: false,
      hasHydrated: false,
      permissionsReady: false,
      setUser: (u, r) => set({ user: u, role: r, isAuthenticated: true }),
      returnUrl: null,
      setReturnUrl: (url) => set({ returnUrl: url }),
      logout: () => {
        clearTenantCookie();
        set({
          user: null,
          role: null,
          isAuthenticated: false,
          permissionsReady: false,
          currentTenant: null,
          enabledFeatures: [],
          allowedModules: null,
          returnUrl: null,
        });
      },
      setHasHydrated: (v) => set({ hasHydrated: v }),
      hydrateSession: (session) => set({
        user: session.username,
        role: session.role,
        isAuthenticated: true,
        availableTenants: session.tenantsAllowed,
        currentTenant: session.currentTenant,
        enabledFeatures: session.enabledFeatures,
        allowedModules: session.allowedModules,
        permissionsReady: true,
      }),

      // ---- Multi-tenant (M2) ----
      currentTenant: null,
      availableTenants: [],
      enabledFeatures: [],
      setTenant: (tenant, features) => {
        setTenantCookie(tenant);
        set({ currentTenant: tenant, enabledFeatures: features, permissionsReady: false });
      },
      setAvailableTenants: (tenants) => set({ availableTenants: tenants }),
      clearTenant: () => {
        clearTenantCookie();
        set({ currentTenant: null, enabledFeatures: [], permissionsReady: false });
      },

      // ---- RBAC per-user modules ----
      allowedModules: null,
      setAllowedModules: (modules) => set({ allowedModules: modules, permissionsReady: true }),
    }),
    {
      name: "motoshop_auth",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => authPersistedState(state),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);

// E2E bridge — se activa solo en dev para inyectar role sin pasar por login
if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__setAuthRole = (role: string | null) => {
    useAuthStore.setState({ role, isAuthenticated: role !== null, hasHydrated: true });
  };
}
