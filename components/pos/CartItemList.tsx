"use client";

import { usePOSStore } from "@/lib/pos/store";
import { formatMoneyFull } from "@/lib/format/currency";
import type { CartItem } from "@/lib/pos/types";

interface CartItemListProps {
  onOpenSearch?: () => void;
}

export function CartItemList({ onOpenSearch }: CartItemListProps): JSX.Element {
  const cart = usePOSStore((s) => s.cart);
  const updateQuantity = usePOSStore((s) => s.updateQuantity);
  const updateDiscount = usePOSStore((s) => s.updateDiscount);
  const removeItem = usePOSStore((s) => s.removeItem);
  const clearCart = usePOSStore((s) => s.clearCart);

  if (cart.length === 0) {
    return (
      <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-surface p-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-4 shadow-inner">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-8 w-8">
            <path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        </div>
        <h3 className="text-lg font-bold text-text-primary">El carrito está vacío</h3>
        <p className="mt-1 text-sm text-text-muted max-w-sm">
          Pasa un producto por el lector de código de barras o busca por nombre y referencia.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={onOpenSearch}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-fg shadow-sm hover:bg-primary-dark active:scale-95 transition-all"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
            </svg>
            Buscar Producto [F7]
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Barra superior de lista */}
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-bold uppercase tracking-wider text-text-muted">
          Detalle de Líneas ({cart.length})
        </span>
        <button
          type="button"
          onClick={() => {
            if (window.confirm("¿Seguro que deseas vaciar el carrito actual?")) {
              clearCart();
            }
          }}
          className="text-xs font-semibold text-rose-600 hover:text-rose-700 hover:underline"
        >
          Vaciar todo
        </button>
      </div>

      {/* Lista de productos */}
      <div className="space-y-2.5">
        {cart.map((item: CartItem) => {
          return (
            <div
              key={item.id}
              className="group relative flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-3.5 shadow-xs hover:border-border-strong transition-all"
            >
              {/* Información del Producto */}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="font-mono text-xs font-bold text-text-secondary bg-surface-alt px-1.5 py-0.5 rounded">
                    {item.product.sku}
                  </span>
                  {item.product.brand && (
                    <span className="text-xs font-semibold text-text-muted">
                      {item.product.brand}
                    </span>
                  )}
                  {item.discountPct > 0 && (
                    <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                      -{item.discountPct}% Desc. (-{formatMoneyFull(item.dctpes * item.candet)})
                    </span>
                  )}
                  {item.vatPct > 0 && (
                    <span className="rounded-md bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-bold text-sky-800">
                      IVA {item.vatPct}% (+{formatMoneyFull(item.ivapes * item.candet)})
                    </span>
                  )}
                </div>

                <h4 className="text-sm font-semibold text-text-primary leading-tight">
                  {item.product.name}
                </h4>

                <div className="mt-1 flex items-center gap-3 text-xs text-text-muted">
                  <span>Unitario: {formatMoneyFull(item.valuni)}</span>
                  <span>•</span>
                  <span>Unidad: {item.product.unit ?? "UND"}</span>
                </div>
              </div>

              {/* Controles de Cantidad y Descuento */}
              <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/60">
                {/* Descuento dropdown */}
                <div className="flex items-center gap-1">
                  <label htmlFor={`discount-${item.id}`} className="sr-only">
                    Descuento %
                  </label>
                  <select
                    id={`discount-${item.id}`}
                    value={item.discountPct}
                    onChange={(e) => updateDiscount(item.id, Number(e.target.value))}
                    className="h-9 rounded-lg border border-border bg-surface-alt px-2 text-xs font-bold text-text-secondary focus:border-primary focus:outline-none"
                    title="Aplicar descuento a esta línea"
                  >
                    <option value={0}>0% Dcto</option>
                    <option value={5}>5%</option>
                    <option value={10}>10%</option>
                    <option value={15}>15%</option>
                    <option value={20}>20%</option>
                  </select>
                </div>

                {/* Controles +/- Cantidad */}
                <div className="flex items-center rounded-xl border border-border bg-surface-alt p-0.5">
                  <button
                    type="button"
                    onClick={() => updateQuantity(item.id, item.candet - 1)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary hover:bg-surface hover:text-text-primary active:scale-95 transition-all"
                    aria-label="Disminuir cantidad"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-3.5 w-3.5">
                      <path d="M5 12h14" strokeLinecap="round" />
                    </svg>
                  </button>

                  <input
                    type="number"
                    step="any"
                    min="0.001"
                    value={item.candet}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      updateQuantity(item.id, Number.isNaN(val) ? 0 : val);
                    }}
                    className="h-8 w-16 text-center text-sm font-black text-text-primary bg-transparent focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    aria-label="Cantidad"
                  />

                  <button
                    type="button"
                    onClick={() => updateQuantity(item.id, item.candet + 1)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary hover:bg-surface hover:text-text-primary active:scale-95 transition-all"
                    aria-label="Aumentar cantidad"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-3.5 w-3.5">
                      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>

                {/* Total de la línea */}
                <div className="min-w-[90px] text-right">
                  <div className="text-base font-black text-primary">
                    {formatMoneyFull(item.totdet)}
                  </div>
                </div>

                {/* Botón eliminar */}
                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-rose-50 hover:text-rose-600 transition-colors"
                  title="Eliminar producto del carrito"
                  aria-label="Eliminar producto"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
                    <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
