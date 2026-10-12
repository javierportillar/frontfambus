import type { Metadata } from "next";
import { ProveedoresIndex } from "@/components/proveedores/ProveedoresIndex";

export const metadata: Metadata = { title: "Proveedores" };

export default function ProveedoresPage(): JSX.Element {
  return <ProveedoresIndex />;
}
