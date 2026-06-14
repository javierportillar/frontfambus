/**
 * Configuración de display para cada tenant.
 * La lista de tenants disponibles viene del backend (JWT + /api/auth/me).
 * Acá solo definimos metadata visual: nombre, descripción, logo, colores.
 */

export interface TenantDisplay {
  slug: string;
  name: string;
  description: string;
  shortDescription: string;
  logo: string; // path relativo a /public/tenants/{slug}/
  color: string; // color primario del tenant
}

const TENANT_DISPLAY: Record<string, TenantDisplay> = {
  motoshop: {
    slug: "motoshop",
    name: "MotoShop",
    description: "Repuestos de moto, Cali",
    shortDescription: "Repuestos y accesorios para motocicletas",
    logo: "/tenants/motoshop/logo.png",
    color: "#7B1818",
  },
  masvital: {
    slug: "masvital",
    name: "MasVital",
    description: "Distribuidora de víveres y abarrotes",
    shortDescription: "Víveres, abarrotes y productos esenciales",
    logo: "/tenants/masvital/logo.png",
    color: "#166534",
  },
};

export function getTenantDisplay(slug: string): TenantDisplay | undefined {
  return TENANT_DISPLAY[slug];
}

export function getAllTenantDisplays(): TenantDisplay[] {
  return Object.values(TENANT_DISPLAY);
}
