import type { Metadata } from "next";
import { ProductosList } from "@/components/erp/ProductosList";

export const metadata: Metadata = { title: "Productos" };

export default function MaestrosProductosPage(): JSX.Element {
  return <ProductosList />;
}
