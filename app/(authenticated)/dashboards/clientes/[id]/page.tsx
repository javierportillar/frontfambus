import type { Metadata } from "next";
import { ClienteProfile } from "@/components/clientes/ClienteProfile";

export const metadata: Metadata = { title: "Perfil del cliente" };

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default function ClienteProfilePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { [key: string]: string | string[] | undefined };
}): JSX.Element {
  const customerId = String(params.id ?? "");
  return (
    <ClienteProfile
      customerId={customerId}
      initialFechaInicio={first(searchParams?.fecha_inicio)}
      initialFechaFin={first(searchParams?.fecha_fin)}
      backQuery={first(searchParams?.q)}
    />
  );
}
