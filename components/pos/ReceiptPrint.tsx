"use client";

import { useEffect, useState } from "react";
import type { SalePayload } from "@/lib/pos/types";

/**
 * Diseño del tiquete tomado de SgHermes (Preparación de Comprobantes → S15 →
 * Impresión → Diseño de impresión en tiquete):
 *
 *   Tipo de letra ................. Arial CE
 *   Nombre de la empresa .......... 13
 *   Otros títulos ................. 9
 *   Total del tiquete ............. 14
 *   Detalles ...................... 8
 *   Impreso por ................... 6
 *   Decimales en la impresión ..... 0
 *   Cifras del número de documento. 4
 *   Logo .......................... 40 x 15 mm
 *   QR ............................ 50 x 50
 *   Columnas adicionales .......... Código, V/Unitario, Impuesto
 *   Orden del detalle ............. Original
 *   Total en letras / Aceptado por  desactivados
 */
const TL = {
  empresa: 13,
  titulo: 9,
  detalle: 8,
  total: 14,
  impresoPor: 6,
} as const;

/** Importe sin decimales, como imprime SgHermes en el tiquete. */
function money0(valor: number): string {
  const n = Number.isFinite(valor) ? valor : 0;
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(n);
}

/** Número de documento con las 4 cifras configuradas. */
function numeroDocumento(documento: string): string {
  const partes = /^(.*?)(\d+)$/.exec(documento ?? "");
  if (partes === null) return documento ?? "";
  return `${partes[1] ?? ""}${(partes[2] ?? "").padStart(4, "0")}`;
}

interface ReceiptPrintProps {
  sale: SalePayload | null;
  onClose?: () => void;
  tenant?: string;
  cufe?: string | null;
  qrUrl?: string | null;
}

export function ReceiptPrint({
  sale,
  onClose,
  tenant = "motoshop",
  cufe,
  qrUrl,
}: ReceiptPrintProps): JSX.Element | null {
  const [paperWidth, setPaperWidth] = useState<"80mm" | "58mm">("80mm");

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        onClose?.();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!sale) return null;

  const isMotoShop = tenant !== "masvital";
  const businessName = isMotoShop ? "MOTOSHOP REPUESTOS & TALLER" : "MASVITAL MARKET S.A.S";
  // Los datos fiscales (NIT, dirección, resolución) NO se imprimen desde acá:
  // estaban inventados en el código. Cuando el negocio los tenga configurados,
  // tienen que venir del backend, no de una constante.

  const formattedDate = new Date(sale.createdAt).toLocaleString("es-CO", {
    dateStyle: "short",
    timeStyle: "medium",
  });

  const effectiveCufe =
    cufe || (sale as unknown as { cufe?: string | null })?.cufe || null;
  const effectiveQrUrl =
    qrUrl ||
    (sale as unknown as { qrUrl?: string | null })?.qrUrl ||
    (effectiveCufe
      ? `https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=${effectiveCufe}`
      : null);

  function handlePrint(): void {
    if (typeof window !== "undefined") {
      window.print();
    }
  }

  return (
    <>
      {/* Estilos dedicados para impresión térmica en rollo continuo */}
      <style jsx global>{`
        @media print {
          /* Ocultar toda la interfaz web general */
          body * {
            visibility: hidden !important;
          }

          /* Mostrar exclusivamente el contenedor térmico */
          #thermal-receipt-container,
          #thermal-receipt-container * {
            visibility: visible !important;
          }

          #thermal-receipt-container {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: ${paperWidth === "80mm" ? "76mm" : "54mm"} !important;
            max-width: ${paperWidth === "80mm" ? "76mm" : "54mm"} !important;
            margin: 0 !important;
            padding: 2mm 3mm !important;
            font-family: Arial, "Arial CE", Helvetica, sans-serif !important;
            color: #000000 !important;
            background: #ffffff !important;
            line-height: 1.2 !important;
            font-size: ${paperWidth === "80mm" ? `${TL.detalle + 1}px` : `${TL.detalle}px`} !important;
          }

          @page {
            size: ${paperWidth === "80mm" ? "80mm auto" : "58mm auto"};
            margin: 0;
          }

          /* Ocultar controles de pantalla al imprimir */
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* Modal / Overlay en Pantalla */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Comprobante de venta para impresión"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose?.();
        }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in duration-150"
      >
        <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-border bg-surface shadow-2xl">
          {/* Barra de control superior (no se imprime) */}
          <div className="no-print flex items-center justify-between border-b border-border bg-surface-dark px-5 py-3.5 text-text-inverse">
            <div className="flex items-center gap-2">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5 text-primary">
                <path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
                <path d="M6 14h12v8H6z" />
              </svg>
              <span className="text-sm font-black">Comprobante de Venta</span>
            </div>

            {/* Selector de ancho de rollo térmico */}
            <div className="flex items-center gap-1 rounded-xl bg-surface-dark-alt p-1 text-xs">
              <button
                type="button"
                onClick={() => setPaperWidth("80mm")}
                className={`rounded-lg px-2.5 py-1 font-bold transition-all ${
                  paperWidth === "80mm"
                    ? "bg-primary text-primary-fg shadow-xs"
                    : "text-text-muted hover:text-text-inverse"
                }`}
              >
                80mm
              </button>
              <button
                type="button"
                onClick={() => setPaperWidth("58mm")}
                className={`rounded-lg px-2.5 py-1 font-bold transition-all ${
                  paperWidth === "58mm"
                    ? "bg-primary text-primary-fg shadow-xs"
                    : "text-text-muted hover:text-text-inverse"
                }`}
              >
                58mm
              </button>
            </div>
          </div>

          {/* Vista previa del ticket térmico con scroll */}
          <div className="flex-1 overflow-y-auto bg-surface-alt/60 p-6 flex justify-center">
            <div
              id="thermal-receipt-container"
              style={{ width: paperWidth === "80mm" ? "320px" : "240px" }}
              className="bg-white p-4 font-mono text-black shadow-lg border border-neutral-300 rounded-sm text-xs leading-relaxed"
            >
              {/* Encabezado del negocio — logo 40x15 mm, nombre a 13 */}
              <div className="text-center pb-2 border-b border-dashed border-neutral-400">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/logo.png"
                  alt={businessName}
                  style={{ width: "40mm", height: "15mm", objectFit: "contain" }}
                  className="mx-auto mb-1"
                />
                <h3 className="font-extrabold uppercase" style={{ fontSize: TL.empresa }}>
                  {businessName}
                </h3>
              </div>

              {/* Datos del documento */}
              <div
                className="py-2 border-b border-dashed border-neutral-400 space-y-0.5"
                style={{ fontSize: TL.titulo }}
              >
                <div className="flex justify-between font-bold">
                  <span>DOCUMENTO:</span>
                  <span>{numeroDocumento(sale.documentNumber)}</span>
                </div>
                <div className="flex justify-between">
                  <span>FECHA:</span>
                  <span>{formattedDate}</span>
                </div>
                <div className="flex justify-between">
                  <span>CAJERO:</span>
                  <span>{sale.cashier}</span>
                </div>
                <div className="flex justify-between">
                  <span>CLIENTE:</span>
                  <span className="truncate max-w-[150px]">{sale.customer.name}</span>
                </div>
                <div className="flex justify-between">
                  <span>NIT/CC:</span>
                  <span>{sale.customer.nit}</span>
                </div>
              </div>

              {/* Detalle de ítems — columnas Código · V/Unitario · Impuesto
                  (config de SgHermes), orden original de la venta */}
              <div className="py-2 border-b border-dashed border-neutral-400">
                <table className="w-full border-collapse" style={{ fontSize: TL.detalle }}>
                  <thead>
                    <tr className="border-b border-neutral-400 text-left font-bold">
                      <th className="py-0.5">Código</th>
                      <th className="py-0.5">Descripción</th>
                      <th className="py-0.5 text-right">Cant</th>
                      <th className="py-0.5 text-right">V/Unit</th>
                      <th className="py-0.5 text-right">Imp</th>
                      <th className="py-0.5 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sale.items.map((it) => (
                      <tr key={it.id} className="align-top">
                        <td className="py-0.5 break-all">{it.product.sku}</td>
                        <td className="py-0.5">{it.product.name}</td>
                        <td className="py-0.5 text-right">{it.candet}</td>
                        <td className="py-0.5 text-right">{money0(it.valuni)}</td>
                        <td className="py-0.5 text-right">
                          {money0((it.ivapes + it.ipopes) * it.candet)}
                        </td>
                        <td className="py-0.5 text-right font-bold">{money0(it.totdet)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totales consolidados */}
              <div className="py-2 border-b border-dashed border-neutral-400 space-y-0.5 text-[11px]">
                <div className="flex justify-between">
                  <span>SUBTOTAL:</span>
                  <span>{money0(sale.totals.subtotal)}</span>
                </div>
                {sale.totals.totalDiscount > 0 && (
                  <div className="flex justify-between text-neutral-700">
                    <span>DESCUENTO:</span>
                    <span>-{money0(sale.totals.totalDiscount)}</span>
                  </div>
                )}
                {sale.totals.totalVat > 0 && (
                  <div className="flex justify-between text-neutral-700">
                    <span>IVA DISCRIMINADO:</span>
                    <span>+{money0(sale.totals.totalVat)}</span>
                  </div>
                )}
                <div
                  className="flex justify-between font-black pt-1 border-t border-neutral-300"
                  style={{ fontSize: TL.total }}
                >
                  <span>TOTAL:</span>
                  <span>{money0(sale.totals.total)}</span>
                </div>
              </div>

              {/* Resumen de Pago */}
              <div
                className="py-2 border-b border-dashed border-neutral-400 space-y-0.5"
                style={{ fontSize: TL.titulo }}
              >
                {sale.payments.length > 1 ? (
                  <>
                    <div className="flex justify-between font-bold">
                      <span>FORMAS DE PAGO ({sale.payments.length}):</span>
                    </div>
                    {sale.payments.map((p, idx) => (
                      <div key={p.id || idx} className="flex justify-between pl-2 text-[10px]">
                        <span>
                          • {p.method}
                          {p.reference ? ` (${p.reference})` : ""}:
                        </span>
                        <span className="font-semibold">{money0(p.amount)}</span>
                      </div>
                    ))}
                  </>
                ) : (
                  <div className="flex justify-between">
                    <span>FORMA DE PAGO:</span>
                    <span className="font-bold">
                      {sale.payments[0]?.method || "EFECTIVO"}
                      {sale.payments[0]?.reference ? ` (${sale.payments[0].reference})` : ""}
                    </span>
                  </div>
                )}
                {sale.cashReceived > 0 && (
                  <div className="flex justify-between">
                    <span>VALOR RECIBIDO:</span>
                    <span>{money0(sale.cashReceived)}</span>
                  </div>
                )}
                {sale.changeGiven > 0 && (
                  <div className="flex justify-between font-bold">
                    <span>CAMBIO:</span>
                    <span>{money0(sale.changeGiven)}</span>
                  </div>
                )}
              </div>

              {/* QR del comprobante (50 x 50) cuando existe; el negocio no
                  emite electrónica, así que sin CUFE no se imprime nada. */}
              {effectiveQrUrl && (
                <div className="py-2 border-b border-dashed border-neutral-400 text-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={effectiveQrUrl}
                    alt="QR del comprobante"
                    style={{ width: "50px", height: "50px" }}
                    className="mx-auto"
                  />
                </div>
              )}

              {/* Mensaje de pie */}
              <div className="pt-3 text-center text-[10px] text-neutral-600 leading-tight space-y-1">
                <p className="font-bold text-black">¡GRACIAS POR SU COMPRA!</p>
                <p>Conserve este ticket para garantías o cambios.</p>
                <p style={{ fontSize: TL.impresoPor }} className="text-neutral-500">
                  Impreso por {sale.cashier} · {formattedDate}
                </p>
              </div>
            </div>
          </div>

          {/* Botones de acción inferiores (no se imprimen) */}
          <div className="no-print border-t border-border bg-surface px-5 py-3.5 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-border bg-surface px-4 py-2.5 text-xs font-bold text-text-secondary hover:bg-surface-alt"
            >
              Cerrar
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-xs font-black text-primary-fg shadow-md hover:bg-primary-dark active:scale-95 transition-all"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-4 w-4">
                <path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
                <path d="M6 14h12v8H6z" />
              </svg>
              <span>Imprimir Ticket (Ctrl+P)</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
