"use client";

import { useEffect, useState } from "react";
import { formatMoneyFull } from "@/lib/format/currency";
import type { SalePayload } from "@/lib/pos/types";

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
  const businessNit = isMotoShop ? "NIT 900.876.543-1" : "NIT 901.234.567-8";
  const businessAddress = isMotoShop
    ? "Calle 15 # 23-45, Barrio Alameda, Cali"
    : "Carrera 1 # 42-10, Cali, Valle";
  const businessPhone = "Tel / WhatsApp: (602) 555-0199 - 315 555 0199";

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
            font-family: "Courier New", Courier, monospace !important;
            color: #000000 !important;
            background: #ffffff !important;
            line-height: 1.2 !important;
            font-size: ${paperWidth === "80mm" ? "12px" : "10px"} !important;
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
              {/* Encabezado del negocio */}
              <div className="text-center pb-2 border-b border-dashed border-neutral-400">
                <h3 className="font-extrabold text-sm uppercase">{businessName}</h3>
                <p className="font-semibold text-[11px]">{businessNit}</p>
                <p className="text-[10px] text-neutral-700">{businessAddress}</p>
                <p className="text-[10px] text-neutral-700">{businessPhone}</p>
                <p className="mt-1 text-[9px] text-neutral-550 leading-tight">
                  IVA Régimen Común • Actividad ICA 4530
                </p>
                <p className="text-[9px] text-neutral-550 leading-tight">
                  Resolución DIAN No. 18760000001 de 2026-01-15
                </p>
                <p className="text-[9px] text-neutral-550 leading-tight">
                  Rango autoriz: POS-000001 a POS-999999
                </p>
              </div>

              {/* Datos del documento */}
              <div className="py-2 border-b border-dashed border-neutral-400 text-[11px] space-y-0.5">
                <div className="flex justify-between font-bold">
                  <span>DOCUMENTO:</span>
                  <span>{sale.documentNumber}</span>
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

              {/* Detalle de ítems */}
              <div className="py-2 border-b border-dashed border-neutral-400 text-[11px]">
                <div className="flex justify-between font-bold pb-1 text-[10px] border-b border-neutral-300">
                  <span>DESCRIPCIÓN</span>
                  <span>CANT x VALOR</span>
                  <span>TOTAL</span>
                </div>

                <div className="space-y-1.5 pt-1.5">
                  {sale.items.map((it) => (
                    <div key={it.id}>
                      <div className="font-semibold leading-tight text-[11px]">
                        {it.product.name}
                      </div>
                      <div className="flex justify-between text-[10px] text-neutral-700">
                        <span>
                          {it.candet} x {formatMoneyFull(it.valuni)}
                          {it.discountPct > 0 && ` (-${it.discountPct}%)`}
                        </span>
                        <span className="font-bold text-black">
                          {formatMoneyFull(it.totdet)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Totales consolidados */}
              <div className="py-2 border-b border-dashed border-neutral-400 space-y-0.5 text-[11px]">
                <div className="flex justify-between">
                  <span>SUBTOTAL:</span>
                  <span>{formatMoneyFull(sale.totals.subtotal)}</span>
                </div>
                {sale.totals.totalDiscount > 0 && (
                  <div className="flex justify-between text-neutral-700">
                    <span>DESCUENTO:</span>
                    <span>-{formatMoneyFull(sale.totals.totalDiscount)}</span>
                  </div>
                )}
                {sale.totals.totalVat > 0 && (
                  <div className="flex justify-between text-neutral-700">
                    <span>IVA DISCRIMINADO:</span>
                    <span>+{formatMoneyFull(sale.totals.totalVat)}</span>
                  </div>
                )}
                <div className="flex justify-between font-black text-sm pt-1 border-t border-neutral-300">
                  <span>TOTAL A PAGAR:</span>
                  <span>{formatMoneyFull(sale.totals.total)}</span>
                </div>
              </div>

              {/* Resumen de Pago */}
              <div className="py-2 border-b border-dashed border-neutral-400 text-[11px] space-y-0.5">
                <div className="flex justify-between">
                  <span>FORMA DE PAGO:</span>
                  <span className="font-bold">
                    {sale.payments.map((p) => p.method).join(", ") || "EFECTIVO"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>VALOR RECIBIDO:</span>
                  <span>{formatMoneyFull(sale.cashReceived)}</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span>CAMBIO:</span>
                  <span>{formatMoneyFull(sale.changeGiven)}</span>
                </div>
              </div>

              {/* Información DIAN: CUFE y Verificación */}
              <div className="py-2 border-b border-dashed border-neutral-400 text-center text-[9px] text-neutral-700 leading-tight space-y-1">
                <p className="font-bold text-black uppercase text-[10px]">
                  Documento Equivalente Electrónico POS
                </p>
                {effectiveCufe ? (
                  <>
                    <p className="font-mono text-[8px] break-all bg-neutral-100 p-1 rounded border border-neutral-300 text-neutral-800">
                      CUFE: {effectiveCufe}
                    </p>
                    <p className="text-[8px] text-neutral-600">
                      Consulte su documento en: catalogo-vpfe.dian.gov.co
                    </p>
                  </>
                ) : (
                  <p className="text-[8px] text-neutral-500 italic">
                    CUFE: En trámite de transmisión DIAN
                  </p>
                )}
              </div>

              {/* Mensaje de pie */}
              <div className="pt-3 text-center text-[10px] text-neutral-600 leading-tight space-y-1">
                <p className="font-bold text-black">¡GRACIAS POR SU COMPRA!</p>
                <p>Conserve este ticket para garantías o cambios.</p>
                <p className="text-[9px] text-neutral-400">
                  Impreso vía MotoShop POS Suite
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
