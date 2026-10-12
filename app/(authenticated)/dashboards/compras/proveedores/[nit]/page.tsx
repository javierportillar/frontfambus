import { redirect } from "next/navigation";

// V1.27: el perfil del proveedor se movió a la sección propia /dashboards/proveedores.
// Se conserva esta ruta como deep link legado redirigiendo al nuevo destino.
export default function SupplierProfileRedirect({
  params,
}: {
  params: { nit: string };
}): never {
  const nit = encodeURIComponent(String(params.nit ?? ""));
  redirect(`/dashboards/proveedores/${nit}`);
}
