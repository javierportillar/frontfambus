import type { Metadata } from "next";
import { TercerosList } from "@/components/erp/TercerosList";

export const metadata: Metadata = { title: "Terceros" };

export default function MaestrosTercerosPage(): JSX.Element {
  return <TercerosList />;
}
