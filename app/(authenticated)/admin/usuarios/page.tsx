"use client";

import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSWRConfig } from "swr";
import {
  type AdminUser,
  type UserRole,
  createUser,
  deactivateUser,
  updateUser,
  useAdminUsers,
  useAssignableModules,
} from "@/lib/api/hooks";
import { useAuthStore } from "@/lib/auth/store";
import { getAllTenantDisplays, getTenantDisplay } from "@/lib/tenant/config";
import {
  adminUsersErrorMessage,
  canManageAdminUser,
  managedUserTenantError,
} from "@/lib/admin/users";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  gerente: "Gerencia",
  vendedor: "Empleado",
};

type FormState = {
  username: string;
  password: string;
  email: string;
  role: UserRole;
  tenants_allowed: string[];
  allowed_modules: string[];
  active: boolean;
};

const EMPTY_FORM: FormState = {
  username: "",
  password: "",
  email: "",
  role: "vendedor",
  tenants_allowed: [],
  allowed_modules: [],
  active: true,
};

export default function UsuariosAdminPage(): JSX.Element {
  const router = useRouter();
  const role = useAuthStore((s) => s.role);
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const availableTenants = useAuthStore((s) => s.availableTenants);
  const currentTenant = useAuthStore((s) => s.currentTenant);
  const { mutate } = useSWRConfig();

  const usersReq = useAdminUsers();
  const { data, isLoading, error } = usersReq;
  const modulesReq = useAssignableModules();
  const modules = useMemo(() => modulesReq.data?.modules ?? [], [modulesReq.data]);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editing, setEditing] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [tenantError, setTenantError] = useState<string | null>(null);
  const tenantGroupRef = useRef<HTMLFieldSetElement>(null);

  const tenantOptions = useMemo(() => {
    const knownSlugs = new Set([
      ...availableTenants,
      ...(currentTenant ? [currentTenant] : []),
      ...form.tenants_allowed,
    ]);
    // Dependency boundary: until the API exposes a tenant catalog, use the
    // authenticated tenant list; local display metadata is only a last resort.
    if (knownSlugs.size === 0) {
      getAllTenantDisplays().forEach((tenant) => knownSlugs.add(tenant.slug));
    }
    return Array.from(knownSlugs).map((slug) => ({
      id: slug,
      label: getTenantDisplay(slug)?.name ?? slug,
    }));
  }, [availableTenants, currentTenant, form.tenants_allowed]);

  // Guard: sólo admin. Si no lo es (y ya hidrató), fuera.
  useEffect(() => {
    if (hasHydrated && role !== "admin") router.replace("/");
  }, [hasHydrated, role, router]);

  const refresh = () =>
    mutate(
      (key) => Array.isArray(key) && typeof key[1] === "string" && key[1].startsWith("/api/admin/users"),
      undefined,
      { revalidate: true },
    );

  function startCreate(): void {
    setEditing(null);
    setForm(EMPTY_FORM);
    setMsg(null);
    setTenantError(null);
    setOpen(true);
  }

  function startEdit(u: AdminUser): void {
    if (!canManageAdminUser(u)) {
      setMsg({ type: "err", text: "Esta cuenta heredada es de solo lectura y no se puede editar desde acá." });
      return;
    }
    setEditing(u.username);
    setForm({
      username: u.username,
      password: "",
      email: u.email,
      role: u.role,
      tenants_allowed: [...u.tenants_allowed],
      allowed_modules: [...u.allowed_modules],
      active: u.active,
    });
    setMsg(null);
    setTenantError(null);
    setOpen(true);
  }

  function closeForm(): void {
    setOpen(false);
    setEditing(null);
    setForm(EMPTY_FORM);
    setTenantError(null);
  }

  function toggle(list: string[], value: string): string[] {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setMsg(null);
    const nextTenantError = managedUserTenantError(form.tenants_allowed);
    setTenantError(nextTenantError);
    if (nextTenantError) {
      tenantGroupRef.current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      if (editing) {
        await updateUser(editing, {
          email: form.email,
          role: form.role,
          tenants_allowed: form.tenants_allowed,
          allowed_modules: form.allowed_modules,
          active: form.active,
          ...(form.password.trim() ? { password: form.password.trim() } : {}),
        });
      } else {
        await createUser({
          username: form.username.trim(),
          password: form.password,
          email: form.email,
          role: form.role,
          tenants_allowed: form.tenants_allowed,
          allowed_modules: form.allowed_modules,
        });
      }
      await refresh();
      closeForm();
      setMsg({ type: "ok", text: editing ? "Usuario actualizado." : "Usuario creado." });
    } catch (e) {
      setMsg({ type: "err", text: adminUsersErrorMessage(e, "save") });
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(u: AdminUser): Promise<void> {
    if (!canManageAdminUser(u)) {
      setMsg({ type: "err", text: "Esta cuenta heredada es de solo lectura y no se puede desactivar desde acá." });
      return;
    }
    try {
      if (u.active) {
        if (!confirm(`¿Desactivar a ${u.username}? No podrá iniciar sesión.`)) return;
        await deactivateUser(u.username);
      } else {
        await updateUser(u.username, { active: true });
      }
      await refresh();
      setMsg({ type: "ok", text: `Usuario ${u.active ? "desactivado" : "reactivado"}.` });
    } catch (e) {
      setMsg({ type: "err", text: adminUsersErrorMessage(e, "status") });
    }
  }

  if (hasHydrated && role !== "admin") return <></>;

  const users = data?.items ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-base font-semibold text-text-primary">Usuarios y permisos</h1>
            <p className="mt-1 text-sm text-text-muted">
              Creá usuarios, asigná su tipo (Admin, Gerencia, Empleado) y a qué módulos entran.
              Los módulos definen lo que <strong>ve</strong> cada usuario; el tipo define lo que
              puede <strong>editar</strong> (Empleado es sólo lectura).
              Las cuentas heredadas se muestran identificadas y son de solo lectura.
            </p>
          </div>
          <button
            type="button"
            onClick={() => (open ? closeForm() : startCreate())}
            className="shrink-0 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-fg hover:bg-primary/90"
          >
            {open ? "Cerrar" : "Nuevo usuario"}
          </button>
        </div>
      </Card>

      {msg && (
        <p
          role="status"
          className={`rounded-lg border px-3 py-2 text-sm ${
            msg.type === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {msg.text}
        </p>
      )}

      {open && (
        <Card header={<h2 className="text-sm font-semibold text-text-primary">{editing ? `Editar ${editing}` : "Nuevo usuario"}</h2>}>
          <form onSubmit={submit} className="grid gap-4">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Usuario" required>
                <input
                  required
                  disabled={!!editing}
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-primary disabled:opacity-60"
                  placeholder="ej. gerencia1"
                  maxLength={64}
                />
              </Field>
              <Field label={editing ? "Nueva contraseña (opcional)" : "Contraseña"} required={!editing}>
                <input
                  required={!editing}
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-primary"
                  placeholder={editing ? "dejar vacío para no cambiar" : "mínimo 4 caracteres"}
                  maxLength={128}
                />
              </Field>
              <Field label="Email">
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-primary"
                  maxLength={255}
                />
              </Field>
              <Field label="Tipo de usuario" required>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-primary"
                >
                  <option value="vendedor">Empleado (sólo lectura)</option>
                  <option value="gerente">Gerencia (puede editar)</option>
                  <option value="admin">Admin (todo + usuarios)</option>
                </select>
              </Field>
            </div>

            <fieldset
              ref={tenantGroupRef}
              tabIndex={-1}
              aria-invalid={tenantError ? true : undefined}
              aria-describedby={tenantError ? "managed-user-tenants-error" : "managed-user-tenants-help"}
              className={`rounded-xl border p-3 outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                tenantError ? "border-red-500 bg-red-50/30" : "border-transparent"
              }`}
            >
              <legend className="px-1 text-sm font-medium text-text-secondary">
                Empresas a las que accede <span className="text-red-700">*</span>
              </legend>
              <div className="flex flex-wrap gap-3">
                {tenantOptions.map((t) => (
                  <label key={t.id} className="flex items-center gap-2 text-sm text-text-secondary">
                    <input
                      type="checkbox"
                      checked={form.tenants_allowed.includes(t.id)}
                      onChange={() => {
                        const tenants = toggle(form.tenants_allowed, t.id);
                        setForm({ ...form, tenants_allowed: tenants });
                        setTenantError(managedUserTenantError(tenants));
                      }}
                    />
                    {t.label}
                  </label>
                ))}
              </div>
              {tenantError && (
                <p id="managed-user-tenants-error" role="alert" className="mt-2 text-xs font-semibold text-red-700">
                  {tenantError}
                </p>
              )}
              <p id="managed-user-tenants-help" className="mt-2 text-xs text-text-muted">
                Las empresas disponibles vienen de tu sesión. Falta que la API publique un catálogo administrable completo.
              </p>
            </fieldset>

            <Field label="Módulos que puede ver">
              {form.role === "admin" ? (
                <p className="text-sm text-text-muted">Admin ve todos los módulos disponibles.</p>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
                  {modules.map((m) => (
                    <label key={m.key} className="flex items-center gap-2 text-sm text-text-secondary">
                      <input
                        type="checkbox"
                        checked={form.allowed_modules.includes(m.key)}
                        onChange={() => setForm({ ...form, allowed_modules: toggle(form.allowed_modules, m.key) })}
                      />
                      {m.label}
                    </label>
                  ))}
                </div>
              )}
            </Field>

            {editing && (
              <Field label="Estado">
                <label className="flex items-center gap-2 text-sm text-text-secondary">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(e) => setForm({ ...form, active: e.target.checked })}
                  />
                  Activo (puede iniciar sesión)
                </label>
              </Field>
            )}

            <div className="flex items-center gap-3">
              <button disabled={submitting} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-fg disabled:opacity-60">
                {submitting ? "Guardando…" : editing ? "Guardar cambios" : "Crear usuario"}
              </button>
              <button type="button" onClick={closeForm} className="rounded-lg bg-surface-alt px-3 py-2 text-sm text-text-secondary">
                Cancelar
              </button>
            </div>
          </form>
        </Card>
      )}

      <Card header={<h2 className="text-sm font-semibold text-text-primary">Usuarios {data ? `(${data.total})` : ""}</h2>}>
        {isLoading && !data ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : error ? (
          <div role="alert" className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-8 text-center">
            <p className="text-sm font-semibold text-text-primary">Usuarios no disponibles</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-text-muted">
              {adminUsersErrorMessage(error, "load")}
            </p>
            <button
              type="button"
              onClick={() => {
                void usersReq.mutate();
                void modulesReq.mutate();
              }}
              className="mt-4 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Reintentar
            </button>
          </div>
        ) : users.length === 0 ? (
          <p className="py-8 text-center text-sm text-text-muted">
            Todavía no hay usuarios gestionados. Creá el primero con “Nuevo usuario”.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[760px] w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-wide text-text-muted">
                <tr>
                  <th className="px-2 py-2 font-medium">Usuario</th>
                  <th className="px-2 py-2 font-medium">Tipo</th>
                  <th className="px-2 py-2 font-medium">Empresas</th>
                  <th className="px-2 py-2 font-medium">Módulos</th>
                  <th className="px-2 py-2 font-medium">Estado</th>
                  <th className="px-2 py-2 font-medium" aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.username} className="border-b border-border/70 last:border-0">
                    <td className="px-2 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-text-primary">{u.username}</span>
                        {u.source === "legacy" && (
                          <span className="inline-flex rounded-full border border-border bg-surface-alt px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                            Heredado · solo lectura
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-text-muted">{u.email || "sin email"}</div>
                    </td>
                    <td className="px-2 py-3 text-text-secondary">{ROLE_LABELS[u.role]}</td>
                    <td className="px-2 py-3 text-text-secondary">{u.tenants_allowed.join(", ") || "—"}</td>
                    <td className="px-2 py-3 text-xs text-text-muted">
                      {u.role === "admin" ? "todos" : u.allowed_modules.length ? `${u.allowed_modules.length} módulos` : "ninguno"}
                    </td>
                    <td className="px-2 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                          u.active ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
                        }`}
                      >
                        {u.active ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td className="px-2 py-3 text-right">
                      {u.manageable ? (
                        <div className="flex justify-end gap-3">
                          <button type="button" onClick={() => startEdit(u)} className="text-xs font-semibold text-accent hover:underline">
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleActive(u)}
                            className="text-xs font-semibold text-text-secondary hover:underline"
                          >
                            {u.active ? "Desactivar" : "Reactivar"}
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-text-muted">Sin acciones</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Field({ label, required = false, children }: { label: string; required?: boolean; children: React.ReactNode }): JSX.Element {
  return (
    <label className="block text-sm font-medium text-text-secondary">
      {label}
      {required ? <span className="text-red-700"> *</span> : null}
      <span className="mt-1 block">{children}</span>
    </label>
  );
}
