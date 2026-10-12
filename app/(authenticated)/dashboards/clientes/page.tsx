import type { Metadata } from "next";
import { ClientesIndex } from "@/components/clientes/ClientesIndex";

export const metadata: Metadata = { title: "Clientes" };

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default function ClientesPage({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined };
}): JSX.Element {
  return (
    <ClientesIndex
      initialFechaInicio={first(searchParams?.fecha_inicio)}
      initialFechaFin={first(searchParams?.fecha_fin)}
      initialQuery={first(searchParams?.q)}
    />
  );
}
