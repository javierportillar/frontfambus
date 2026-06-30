import { redirect } from "next/navigation";

// V1.23: /dashboards/productos se unificó dentro de /dashboards/inventario.
// La ficha individual por SKU (/dashboards/productos/[sku]) sigue funcionando como deep link.
export default function ProductosRedirect(): never {
  redirect("/dashboards/inventario?tab=resumen");
}
