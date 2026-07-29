const TENANT_ONLY_ROUTES: ReadonlyArray<readonly [string, string]> = [
  ["/catalogo", "masvital"],
];

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function requiredTenantForPath(pathname: string): string | null {
  return (
    TENANT_ONLY_ROUTES.find(([prefix]) =>
      matchesPrefix(pathname, prefix),
    )?.[1] ?? null
  );
}

export function canTenantAccessPath(
  pathname: string,
  tenant: string | null,
): boolean {
  const requiredTenant = requiredTenantForPath(pathname);
  return requiredTenant === null || tenant === requiredTenant;
}
