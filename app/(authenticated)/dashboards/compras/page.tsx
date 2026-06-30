import { redirect } from "next/navigation";

// V1.23: /dashboards/compras se unificó dentro de /dashboards/movimientos.
// El detalle diario (/dashboards/compras/dia/[date]) sigue funcionando como deep link.
export default function ComprasRedirect(): never {
  redirect("/dashboards/movimientos?modo=compras");
}
