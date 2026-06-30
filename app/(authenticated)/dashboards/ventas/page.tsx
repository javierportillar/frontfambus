import { redirect } from "next/navigation";

// V1.23: /dashboards/ventas se unificó dentro de /dashboards/movimientos.
// El detalle diario (/dashboards/ventas/dia/[date]) sigue funcionando como deep link.
export default function VentasRedirect(): never {
  redirect("/dashboards/movimientos?modo=ventas");
}
