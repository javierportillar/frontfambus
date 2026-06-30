import { redirect } from "next/navigation";

// V1.24: /forecast se unificó dentro de /dashboards/decisiones.
// Mantenemos la URL vieja como deep link al tab Demanda.
export default function ForecastRedirect(): never {
  redirect("/dashboards/decisiones?tab=demanda");
}
