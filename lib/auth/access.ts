export interface AccessContext {
  role: string | null;
  enabledFeatures: readonly string[];
  allowedModules: readonly string[] | null;
}

export type PathAccessRule =
  | { feature: string }
  | { anyOfFeatures: readonly string[] }
  | { adminOnly: true };

const PATH_RULES: ReadonlyArray<readonly [string, PathAccessRule]> = [
  ["/admin/usuarios", { adminOnly: true }],
  ["/admin/pipeline", { feature: "pipeline-observability" }],
  ["/admin/data-catalog", { feature: "data-catalog" }],
  ["/dashboards/movimientos", { feature: "ventas-summary" }],
  ["/dashboards/ventas", { feature: "ventas-summary" }],
  ["/dashboards/compras", { feature: "ventas-summary" }],
  ["/dashboards/inventario", { feature: "inventario" }],
  ["/dashboards/productos", { feature: "inventario" }],
  ["/dashboards/decisiones", { feature: "decisiones" }],
  ["/dashboards/analisis", { anyOfFeatures: ["analisis", "forecast"] }],
  ["/dashboards/abc", { feature: "abc" }],
  ["/dashboards/dormidos", { feature: "dormidos" }],
  ["/alerts", { feature: "alerts" }],
  ["/acciones", { feature: "acciones" }],
  ["/cohortes", { feature: "cohortes" }],
  ["/vendedores", { feature: "vendedores" }],
  ["/drift", { feature: "drift" }],
  ["/forecast", { feature: "forecast" }],
];

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function resolvePathAccess(pathname: string): PathAccessRule | null {
  return PATH_RULES.find(([prefix]) => matchesPrefix(pathname, prefix))?.[1] ?? null;
}

export function canAccessFeature(feature: string, context: AccessContext): boolean {
  if (!context.enabledFeatures.includes(feature)) return false;
  if (context.role === "admin" || context.allowedModules === null) return true;
  return context.allowedModules.includes(feature);
}

export function canAccessPath(pathname: string, context: AccessContext): boolean {
  const rule = resolvePathAccess(pathname);
  if (!rule) return true;
  if ("adminOnly" in rule) return context.role === "admin";
  if ("anyOfFeatures" in rule) {
    return rule.anyOfFeatures.some((feature) => canAccessFeature(feature, context));
  }
  return canAccessFeature(rule.feature, context);
}
