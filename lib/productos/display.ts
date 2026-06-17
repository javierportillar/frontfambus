import type { ProductEstado, ProductAccion, ProductAbc } from "@/lib/api/hooks";

/**
 * Configuración de display para estados, acciones y ABC de productos.
 * Centralizado para que la tabla, las cards y la ficha usen los mismos
 * labels y colores. Lenguaje pensado para un gerente, no para un ingeniero.
 */

export const ESTADO_CONFIG: Record<ProductEstado, { label: string; color: string; bg: string; desc: string }> = {
  saludable:      { label: "Saludable",      color: "#15803D", bg: "#DCFCE7", desc: "Rota bien, stock sano" },
  quiebre:        { label: "Por agotarse",   color: "#B91C1C", bg: "#FEE2E2", desc: "Se acaba en menos de 15 días" },
  agotado:        { label: "Agotado",        color: "#B91C1C", bg: "#FEE2E2", desc: "Sin stock pero se vende" },
  sobrestock:     { label: "Sobrestock",     color: "#C2410C", bg: "#FFEDD5", desc: "Más de 6 meses de stock" },
  dormido:        { label: "Dormido",        color: "#6B7280", bg: "#F3F4F6", desc: "Sin venta hace 90+ días" },
  sin_stock:      { label: "Sin stock",      color: "#6B7280", bg: "#F3F4F6", desc: "Agotado y sin movimiento" },
  sin_movimiento: { label: "Sin movimiento", color: "#6B7280", bg: "#F3F4F6", desc: "No vendió en la ventana" },
  servicio:       { label: "Servicio",       color: "#7C3AED", bg: "#F3E8FF", desc: "No es inventariable" },
};

export const ACCION_CONFIG: Record<ProductAccion, { label: string; color: string; bg: string }> = {
  reabastecer: { label: "Reabastecer", color: "#B91C1C", bg: "#FEE2E2" },
  liquidar:    { label: "Liquidar",    color: "#C2410C", bg: "#FFEDD5" },
  revisar:     { label: "Revisar",     color: "#6B7280", bg: "#F3F4F6" },
  ok:          { label: "OK",          color: "#15803D", bg: "#DCFCE7" },
  "n/a":       { label: "—",           color: "#9CA3AF", bg: "#F9FAFB" },
};

export const ABC_CONFIG: Record<ProductAbc, { label: string; color: string; bg: string; desc: string }> = {
  A:          { label: "A", color: "#15803D", bg: "#DCFCE7", desc: "Top — 80% de las ventas" },
  B:          { label: "B", color: "#C2410C", bg: "#FFEDD5", desc: "Medio — siguiente 15%" },
  C:          { label: "C", color: "#6B7280", bg: "#F3F4F6", desc: "Cola — último 5%" },
  sin_venta:  { label: "—", color: "#9CA3AF", bg: "#F9FAFB", desc: "Sin ventas en la ventana" },
};

export function estadoCfg(e: ProductEstado) {
  return ESTADO_CONFIG[e] ?? ESTADO_CONFIG.sin_movimiento;
}
export function accionCfg(a: ProductAccion) {
  return ACCION_CONFIG[a] ?? ACCION_CONFIG["n/a"];
}
export function abcCfg(a: ProductAbc) {
  return ABC_CONFIG[a] ?? ABC_CONFIG.sin_venta;
}

/** Días de stock → texto humano ("se acaba en 5 días", "164 días", "—"). */
export function diasStockLabel(dias: number | null): string {
  if (dias === null || dias === undefined) return "—";
  if (dias < 0) return "—";
  if (dias > 365) return "+1 año";
  return `${Math.round(dias)} días`;
}
