"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useBankVerification } from "@/lib/api/hooks";
import {
  createBankVerification,
  esEstadoFinal,
  mensajeDeErrorDeVerificacion,
  resultadoDelJob,
  type BankCandidato,
  type BankJob,
} from "@/lib/erp/bank";

/**
 * Cola de verificaciones bancarias de la pantalla de ventas.
 *
 * El nodo **raspa de a una**: tiene un turno de sesión con intervalo mínimo. Si
 * se disparan dos jobs a la vez, el segundo choca contra el turno y falla. Por
 * eso el frente encola: un solo job en vuelo, y el resto espera su turno con un
 * mensaje claro en vez de un error.
 *
 * El estado vive acá y no en el modal, así que cerrar la factura y abrir otra
 * no pierde el progreso: al volver, la verificación sigue donde estaba.
 */

export interface PedidoVerificacion {
  /** Clave de la factura: `${cod_clase}-${num_documento}`. */
  clave: string;
  codClase: string;
  numDocumento: string;
  fecha: string;
  valor: number;
  referencia: string;
  nombreEsperado?: string;
  /** Lo que ya está guardado en el servidor, para no re-verificar de cero. */
  verificado?: boolean;
}

export type EstadoSesion = {
  estado:
    | "en_cola"
    | "consultando"
    | "esperando_otp"
    | "resuelto"
    | "sin_coincidencia"
    | "ambiguo"
    | "fallido";
  jobId: string | null;
  paso?: string;
  pct?: number;
  error?: string;
  /** Resultado del job, para que el modal lo muestre sin volver a consultar. */
  candidato?: BankCandidato | null;
  candidatos?: BankCandidato[];
};

export interface ColaVerificacion {
  /** Encola la verificación de una factura (idempotente por clave). */
  encolar: (pedido: PedidoVerificacion) => void;
  /** Estado de cada factura, por clave. */
  sesiones: Record<string, EstadoSesion>;
  /** Posición en la cola (1 = la que se está corriendo), `null` si no está. */
  posicion: (clave: string) => number | null;
  total: number;
  /** La que está en vuelo ahora mismo. */
  activa: PedidoVerificacion | null;
}

/** Estado del job del nodo → estado que entiende la cola. */
function estadoDeSesion(estado: BankJob["estado"]): EstadoSesion["estado"] {
  switch (estado) {
    case "en_cola":
      return "en_cola";
    case "ejecutando":
      return "consultando";
    case "esperando_otp":
      return "esperando_otp";
    case "resuelto":
      return "resuelto";
    case "sin_coincidencia":
      return "sin_coincidencia";
    case "ambiguo":
      return "ambiguo";
    default:
      return "fallido";
  }
}

export function useColaVerificacion(
  onTerminado: (pedido: PedidoVerificacion, job: BankJob) => void,
): ColaVerificacion {
  const [cola, setCola] = useState<PedidoVerificacion[]>([]);
  const [sesiones, setSesiones] = useState<Record<string, EstadoSesion>>({});
  const creandoRef = useRef<string | null>(null);
  const cerradaRef = useRef<string | null>(null);
  const terminadoRef = useRef(onTerminado);
  terminadoRef.current = onTerminado;

  const activa = cola[0] ?? null;
  const sesionActiva = activa ? sesiones[activa.clave] : undefined;

  const { data } = useBankVerification(sesionActiva?.jobId ?? null, {
    refreshInterval: 2_000,
  });

  // Sólo vale el job de ESTA sesión: el hook conserva el dato anterior entre
  // claves (keepPreviousData) y no puede filtrarse a otra factura.
  const jobActual =
    data && sesionActiva?.jobId && data.job_id === sesionActiva.jobId
      ? data
      : null;

  // Arranca el job de la primera de la cola.
  useEffect(() => {
    if (!activa) return;
    const sesion = sesiones[activa.clave];
    if (!sesion || sesion.jobId || creandoRef.current === activa.clave) return;
    creandoRef.current = activa.clave;
    createBankVerification({
      valor: activa.valor,
      fecha: activa.fecha,
      ...(activa.nombreEsperado ? { nombreEsperado: activa.nombreEsperado } : {}),
    })
      .then((job) => {
        setSesiones((prev) => ({
          ...prev,
          [activa.clave]: { estado: "consultando", jobId: job.job_id },
        }));
      })
      .catch((error: unknown) => {
        setSesiones((prev) => ({
          ...prev,
          [activa.clave]: {
            estado: "fallido",
            jobId: null,
            error:
              mensajeDeErrorDeVerificacion(error) ??
              "No se pudo iniciar la consulta al banco.",
          },
        }));
        // Una que no arranca no puede tapar la cola: se libera el turno.
        setCola((prev) => prev.filter((p) => p.clave !== activa.clave));
      })
      .finally(() => {
        creandoRef.current = null;
      });
  }, [activa, sesiones]);

  // Refleja el progreso y cierra la sesión cuando el job termina.
  useEffect(() => {
    if (!activa || !jobActual) return;
    const progreso = jobActual.resultado?.progreso;
    setSesiones((prev) => ({
      ...prev,
      [activa.clave]: {
        estado: estadoDeSesion(jobActual.estado),
        jobId: prev[activa.clave]?.jobId ?? jobActual.job_id,
        paso: progreso?.paso,
        pct: progreso?.pct,
        candidato: resultadoDelJob(jobActual)?.candidato ?? null,
        candidatos: resultadoDelJob(jobActual)?.candidatos ?? [],
      },
    }));
    if (
      esEstadoFinal(jobActual.estado) &&
      cerradaRef.current !== jobActual.job_id
    ) {
      cerradaRef.current = jobActual.job_id;
      terminadoRef.current(activa, jobActual);
      setCola((prev) => prev.slice(1));
    }
  }, [activa, jobActual]);

  const encolar = useCallback((pedido: PedidoVerificacion) => {
    setSesiones((prev) =>
      prev[pedido.clave]
        ? prev
        : { ...prev, [pedido.clave]: { estado: "en_cola", jobId: null } },
    );
    setCola((prev) =>
      prev.some((p) => p.clave === pedido.clave) ? prev : [...prev, pedido],
    );
  }, []);

  const posicion = useCallback(
    (clave: string) => {
      const indice = cola.findIndex((p) => p.clave === clave);
      return indice === -1 ? null : indice + 1;
    },
    [cola],
  );

  return { encolar, sesiones, posicion, total: cola.length, activa };
}
