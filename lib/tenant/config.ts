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
  color: string; // color primario (sidebar activo, énfasis, botones primarios)
  accent: string; // color acento (chips, links, detalles)
  surfaceTint: string; // tinte muy claro para fondos secundarios
}

const TENANT_DISPLAY: Record<string, TenantDisplay> = {
  motoshop: {
    slug: "motoshop",
    name: "MotoShop",
    description: "Repuestos de moto, Cali",
    shortDescription: "Repuestos y accesorios para motocicletas",
    logo: "/tenants/motoshop/logo.png",
    color: "#7B1818",
    accent: "#C83828",
    surfaceTint: "#FBE9E7",
  },
  masvital: {
    slug: "masvital",
    name: "MasVital",
    description: "Distribuidora de víveres y abarrotes",
    shortDescription: "Víveres, abarrotes y productos esenciales",
    logo: "/tenants/masvital/logo.png",
    // Colores extraídos del logo "Más Vital Market":
    //   color: verde forestal del texto "Vital" (#204020 levemente ajustado para vibrancia)
    //   accent: verde lima de la hoja decorativa (#709030 ajustado)
    //   surfaceTint: lavado pálido del verde para fondos secundarios
    color: "#1F4E2A",
    accent: "#84A33B",
    surfaceTint: "#E8F1DE",
  },
};

export function getTenantDisplay(slug: string): TenantDisplay | undefined {
  return TENANT_DISPLAY[slug];
}

export function getAllTenantDisplays(): TenantDisplay[] {
  return Object.values(TENANT_DISPLAY);
}
