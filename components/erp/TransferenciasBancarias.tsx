"use client";

import { useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useBankMovements } from "@/lib/erp/hooks";
import {
  applyBankMovement,
  BANK_ESTADOS_RESOLUBLES,
  BANK_MOVIMIENTO_ESTADOS,
  formatBankValor,
  listBankCandidates,
  type BankCandidato,
  type BankMovimiento,
  type BankMovimientoEstado,
} from "@/lib/erp/bank";
import { generateIdempotencyKey } from "@/lib/erp/idempotency";

const ETIQUETAS: Record<BankMovimientoEstado, string> = {
  PENDIENTE: "Pendiente",
  APLICADO: "Aplicado",
  AMBIGUA: "Ambigua",
  SIN_MATCH: "Sin match",
  SOBREPAGO: "Sobrepago",
  IGNORADO: "Ignorado",
};

const TONOS: Record<BankMovimientoEstado, string> = {
  PENDIENTE: "bg-slate-100 text-slate-700",
  APLICADO: "bg-emerald-100 text-emerald-800",
  AMBIGUA: "bg-amber-100 text-amber-800",
  SIN_MATCH: "bg-sky-100 text-sky-800",
  SOBREPAGO: "bg-red-100 text-red-800",
  IGNORADO: "bg-slate-200 text-slate-500",
};

/** Quita caracteres de control y recorta: la referencia viene del portal. */
export function sanearTexto(valor: string | null | undefined): string {
  if (!valor) return "—";
  // eslint-disable-next-line no-control-regex
  const limpio = valor.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return limpio.length > 0 ? limpio : "—";
}

function EstadoBadge({ estado }: { estado: BankMovimientoEstado }): JSX.Element {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold ${TONOS[estado]}`}
    >
      {ETIQUETAS[estado]}
    </span>
  );
}

function Filtros({
  estado,
  desde,
  hasta,
  onEstado,
  onDesde,
  onHasta,
}: {
  estado: BankMovimientoEstado | "";
  desde: string;
  hasta: string;
  onEstado: Dispatch<SetStateAction<BankMovimientoEstado | "">>;
  onDesde: Dispatch<SetStateAction<string>>;
  onHasta: Dispatch<SetStateAction<string>>;
}): JSX.Element {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
        Estado
        <select
          aria-label="Filtrar por estado"
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900"
          value={estado}
          onChange={(event) =>
            onEstado(event.target.value as BankMovimientoEstado | "")
          }
        >
          <option value="">Todos</option>
          {BANK_MOVIMIENTO_ESTADOS.map((valor) => (
            <option key={valor} value={valor}>
              {ETIQUETAS[valor]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
        Desde
        <input
          aria-label="Filtrar desde"
          type="date"
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900"
          value={desde}
          onChange={(event) => onDesde(event.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
        Hasta
        <input
          aria-label="Filtrar hasta"
          type="date"
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900"
          value={hasta}
          onChange={(event) => onHasta(event.target.value)}
        />
      </label>
    </div>
  );
}

/** Panel de resolución manual: elegir factura o consignar sin factura. */
function ResolucionManual({
  movimiento,
  onCancelar,
  onAplicado,
}: {
  movimiento: BankMovimiento;
  onCancelar: () => void;
  onAplicado: () => void;
}): JSX.Element {
  const [candidatos, setCandidatos] = useState<BankCandidato[] | null>(null);
  const [elegido, setElegido] = useState<string | null>(
    movimiento.estado === "SIN_MATCH" ? null : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [clave] = useState(() => generateIdempotencyKey());

  const buscar = async (): Promise<void> => {
    setError(null);
    try {
      const resultado = await listBankCandidates({
        valor: movimiento.valor,
        desde: movimiento.fecha,
        hasta: movimiento.fecha,
      });
      setCandidatos(resultado.candidatos);
    } catch {
      setError("No se pudieron traer los candidatos.");
    }
  };

  const aplicar = async (): Promise<void> => {
    setEnviando(true);
    setError(null);
    try {
      await applyBankMovement(movimiento.id, {
        facturaId: elegido,
        idempotencyKey: clave,
      });
      onAplicado();
    } catch {
      setError("No se pudo aplicar el movimiento.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-label={`Resolver movimiento ${sanearTexto(movimiento.referencia)}`}
      className="rounded-lg border border-slate-300 bg-slate-50 p-4"
    >
      <p className="text-sm font-semibold text-slate-900">
        {formatBankValor(movimiento.valor)} · {sanearTexto(movimiento.pagadorNombre)}
      </p>
      {movimiento.razones ? (
        <p className="mt-1 text-xs text-slate-600">{sanearTexto(movimiento.razones)}</p>
      ) : null}

      {movimiento.estado === "SIN_MATCH" ? (
        <p className="mt-3 text-xs text-slate-600">
          Sin factura: se registrará como consignación bancaria.
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          <button
            type="button"
            className="w-fit rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700"
            onClick={() => void buscar()}
          >
            Buscar facturas candidatas
          </button>
          {candidatos === null ? null : candidatos.length === 0 ? (
            <p className="text-xs text-slate-600">No hay facturas candidatas.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {candidatos.map((candidato) => (
                <li key={candidato.id}>
                  <label className="flex items-center gap-2 text-xs text-slate-700">
                    <input
                      type="radio"
                      name="candidato"
                      value={candidato.id}
                      checked={elegido === candidato.id}
                      onChange={() => setElegido(candidato.id)}
                    />
                    {candidato.id} · {formatBankValor(candidato.valor)} ·{" "}
                    {sanearTexto(candidato.pagadorNombre)}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className="rounded-md bg-slate-900 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
          disabled={enviando || (movimiento.estado !== "SIN_MATCH" && !elegido)}
          onClick={() => void aplicar()}
        >
          {enviando ? "Aplicando…" : "Confirmar aplicación"}
        </button>
        <button
          type="button"
          className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700"
          onClick={onCancelar}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

/**
 * Transferencias bancarias: listado operativo y resolución manual.
 *
 * El importe se muestra como texto (`100000.00`), la referencia se sanea antes
 * de pintarse y "Aplicar" sólo aparece en los estados que la API acepta
 * resolver a mano (`AMBIGUA`, `SOBREPAGO`, `SIN_MATCH`): un movimiento ya
 * aplicado no ofrece la acción.
 */
export function TransferenciasBancarias(): JSX.Element {
  const [estado, setEstado] = useState<BankMovimientoEstado | "">("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [resolviendo, setResolviendo] = useState<BankMovimiento | null>(null);

  const { data, error, isLoading, mutate } = useBankMovements({
    estado: estado || undefined,
    desde: desde || undefined,
    hasta: hasta || undefined,
  });

  const movimientos = useMemo(() => {
    const todos = data ?? [];
    return todos.filter((movimiento) => {
      if (estado && movimiento.estado !== estado) return false;
      if (desde && movimiento.fecha < desde) return false;
      if (hasta && movimiento.fecha > hasta) return false;
      return true;
    });
  }, [data, estado, desde, hasta]);

  return (
    <Card className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-slate-900">
          Transferencias bancarias
        </h1>
        <Filtros
          estado={estado}
          desde={desde}
          hasta={hasta}
          onEstado={setEstado}
          onDesde={setDesde}
          onHasta={setHasta}
        />
      </div>

      {resolviendo ? (
        <ResolucionManual
          movimiento={resolviendo}
          onCancelar={() => setResolviendo(null)}
          onAplicado={() => {
            setResolviendo(null);
            void mutate();
          }}
        />
      ) : null}

      {error ? (
        <ErrorState
          severity="critical"
          title="No se pudieron cargar los movimientos"
          message="El backend no respondió. Reintentá en unos segundos."
        />
      ) : isLoading ? (
        <div className="flex flex-col gap-2" aria-label="Cargando movimientos">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      ) : movimientos.length === 0 ? (
        <EmptyState
          title="Sin movimientos"
          description="No hay transferencias que coincidan con los filtros."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-2 py-2">Fecha</th>
                <th className="px-2 py-2">Descripción</th>
                <th className="px-2 py-2">Referencia</th>
                <th className="px-2 py-2 text-right">Importe</th>
                <th className="px-2 py-2">Pagador</th>
                <th className="px-2 py-2">Estado</th>
                <th className="px-2 py-2">Documento</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {movimientos.map((movimiento) => (
                <tr key={movimiento.id} className="border-t border-slate-200">
                  <td className="px-2 py-2 text-slate-700">{movimiento.fecha}</td>
                  <td className="px-2 py-2 text-slate-900">
                    {sanearTexto(movimiento.descripcion)}
                  </td>
                  <td className="px-2 py-2 text-slate-600">
                    {sanearTexto(movimiento.referencia)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-slate-900">
                    {formatBankValor(movimiento.valor)}
                  </td>
                  <td className="px-2 py-2 text-slate-700">
                    {sanearTexto(movimiento.pagadorNombre)}
                  </td>
                  <td className="px-2 py-2">
                    <EstadoBadge estado={movimiento.estado} />
                  </td>
                  <td className="px-2 py-2 text-slate-700">
                    {sanearTexto(movimiento.reciboNumero)}
                  </td>
                  <td className="px-2 py-2 text-right">
                    {BANK_ESTADOS_RESOLUBLES.includes(movimiento.estado) ? (
                      <button
                        type="button"
                        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700"
                        onClick={() => setResolviendo(movimiento)}
                      >
                        Aplicar
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
