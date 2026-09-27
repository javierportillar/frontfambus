import type { Metadata } from "next";
import { SupplierProfile } from "@/components/compras/SupplierProfile";

export const metadata: Metadata = { title: "Perfil del proveedor" };

export default function SupplierProfilePage({
  params,
}: {
  params: { nit: string };
}): JSX.Element {
  const nit = String(params.nit ?? "");
  return <SupplierProfile nit={nit} />;
}
