"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { listarVentasPOS, type VentaPOS } from "@/lib/api/pos";
import { listarVentasVerificadas, type VentaVerificada } from "@/lib/erp/bank";
import { formatMoneyFull } from "@/lib/format/currency";

function hoyISO(): string {
  const ahora = new Date();
  const mes = String(ahora.getMonth() + 1).padStart(2, "0");
  const dia = String(ahora.getDate()).padStart(2, "0");
  return `${ahora.getFullYear()}-${mes}-${dia}`;
}

/**
 * Ventas hechas por el POS web.
 *
 * Se distinguen de las de SgHermes por el journal de escritura del motor: lo
 * que se factura a mano en el escritorio no deja fila ahí. Cada venta se puede
 * expandir para ver productos y pagos, y muestra si el pago fue verificado
 * contra el banco (el mismo dato que estampa la tarjeta del día).
 */
export default function PosFacturasPage(): JSX.Element {
  const [fecha, setFecha] = useState(hoyISO());
  const [ventas, setVentas] = useState<VentaPOS[]>([]);
  const [verificadas, setVerificadas] = useState<Map<string, VentaVerificada>>(new Map());
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);

  const cargar = useCallback(async (dia: string) => {
    setCargando(true);
    setError(null);
    try {
      const [lista, verificadasDia] = await Promise.all([
        listarVentasPOS(dia),
        listarVentasVerificadas(dia),
      ]);
      setVentas(lista);
      setVerificadas(
        new Map(
          verificadasDia.map((v) => [`${v.cod_clase}-${v.num_documento}`, v] as const),
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar las ventas.");
      setVentas([]);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar(fecha);
  }, [fecha, cargar]);

  return (
    <div className="min-w-0 space-y-4">
      <Link href="/pos" className="text-sm text-accent hover:underline">
        ← Volver al POS
      </Link>

      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Facturas del POS</h1>
          <p className="text-sm text-text-muted">
            Ventas creadas desde la web. Las de SgHermes no aparecen acá.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="fecha" className="text-xs font-bold text-text-secondary">
            Día
          </label>
          <input
            id="fecha"
            type="date"
            value={fecha}
            max={hoyISO()}
            onChange={(e) => setFecha(e.target.value)}
            className="rounded-lg border border-border bg-surface px-2 py-1.5 text-xs font-semibold"
          />
          <button
            type="button"
            onClick={() => void cargar(fecha)}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-text-secondary hover:bg-surface-alt"
          >
            Actualizar
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs font-semibold text-rose-900">
          {error}
        </p>
      )}

      {cargando ? (
        <p className="text-sm text-text-muted">Cargando…</p>
      ) : ventas.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface p-6 text-center text-sm text-text-muted">
          No hay ventas del POS en ese día.
        </p>
      ) : (
        <div className="space-y-2">
          {ventas.map((venta) => {
            const verificada = verificadas.get(`${venta.codclase}-${venta.numfven}`);
            const pagoVerificado = verificada?.estado === "verificado" ? verificada : null;
            const expandida = abierta === venta.numfven;
            return (
              <div
                key={`${venta.codclase}-${venta.numfven}`}
                className="rounded-xl border border-border bg-surface"
              >
                <button
                  type="button"
                  onClick={() => setAbierta(expandida ? null : venta.numfven)}
                  aria-expanded={expandida}
                  className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left transition-colors hover:bg-surface-alt"
                >
                  <span className="text-sm font-bold text-text-primary">{venta.documento}</span>
                  <span className="text-xs text-text-muted">{venta.hora}</span>
                  <span className="max-w-[180px] truncate text-xs text-text-secondary">
                    {venta.cliente || "Consumidor Final"}
                  </span>
                  <span className="rounded-full bg-surface-alt px-2 py-0.5 text-[10px] font-semibold text-text-secondary">
                    {venta.formapago}
                  </span>
                  {venta.anulada && (
                    <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                      ANULADA
                    </span>
                  )}
                  {pagoVerificado && (
                    <span
                      data-testid={`verificada-${venta.numfven}`}
                      className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-800"
                      title={`${pagoVerificado.pagador} · ${pagoVerificado.referencia}`}
                    >
                      ✓ Pago verificado
                    </span>
                  )}
                  <span className="ml-auto text-sm font-bold text-text-primary">
                    {formatMoneyFull(Number(venta.total))}
                  </span>
                </button>

                {expandida && (
                  <div className="space-y-3 border-t border-border px-4 py-3 text-xs">
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                      <div>
                        <span className="text-text-muted">Cajero:</span>{" "}
                        <strong>{venta.cajero}</strong>
                      </div>
                      <div>
                        <span className="text-text-muted">Caja:</span>{" "}
                        <strong>{venta.caja}</strong>
                      </div>
                      <div>
                        <span className="text-text-muted">NIT:</span>{" "}
                        <strong className="font-mono">{venta.nitter}</strong>
                      </div>
                      <div>
                        <span className="text-text-muted">Bodega:</span>{" "}
                        <strong className="font-mono">{venta.lineas[0]?.codbod ?? "—"}</strong>
                      </div>
                    </div>

                    {pagoVerificado && (
                      <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2 text-emerald-900">
                        Pago verificado: <strong>{pagoVerificado.pagador}</strong> ·{" "}
                        {formatMoneyFull(Number(pagoVerificado.valor))} · ref.{" "}
                        <span className="font-mono">{pagoVerificado.referencia}</span>
                      </p>
                    )}

                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border text-left text-[0.65rem] uppercase tracking-wide text-text-muted">
                          <th className="py-1">Código</th>
                          <th className="py-1">Producto</th>
                          <th className="py-1 text-right">Cant.</th>
                          <th className="py-1 text-right">Unitario</th>
                          <th className="py-1 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {venta.lineas.map((linea) => (
                          <tr key={`${venta.numfven}-${linea.numite}`} className="border-b border-border/40">
                            <td className="py-1 font-mono text-[11px]">{linea.codprod}</td>
                            <td className="py-1">{linea.nomdet}</td>
                            <td className="py-1 text-right">{linea.candet}</td>
                            <td className="py-1 text-right font-mono">
                              {formatMoneyFull(Number(linea.valuni))}
                            </td>
                            <td className="py-1 text-right font-mono">
                              {formatMoneyFull(Number(linea.totdet))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <div className="flex flex-wrap gap-2">
                      {venta.pagos.map((pago, i) => (
                        <span
                          key={`${venta.numfven}-pago-${i}`}
                          className="rounded-lg border border-border bg-surface-alt px-2 py-1 text-[11px]"
                        >
                          {pago.codpag} · {formatMoneyFull(Number(pago.valpag))} · {pago.estado}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
