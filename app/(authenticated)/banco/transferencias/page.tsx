import type { Metadata } from "next";
import { TransferenciasBancarias } from "@/components/erp/TransferenciasBancarias";

export const metadata: Metadata = { title: "Transferencias bancarias" };

export default function BancoTransferenciasPage(): JSX.Element {
  return <TransferenciasBancarias />;
}
