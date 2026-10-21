"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { usePOSStore } from "@/lib/pos/store";
import { useAuthStore } from "@/lib/auth/store";
import {
  searchPOSProducts,
  getActiveCashSession,
  getPendingSales,
  flushPendingSales,
} from "@/lib/api/pos";
import { formatMoneyFull } from "@/lib/format/currency";
import { BarcodeScannerListener, playSuccessBeep } from "@/components/pos/BarcodeScannerListener";
import { ProductSearchModal } from "@/components/pos/ProductSearchModal";
import { CartItemList } from "@/components/pos/CartItemList";
import { PaymentModal } from "@/components/pos/PaymentModal";
import { ReceiptPrint } from "@/components/pos/ReceiptPrint";
import type { POSProduct } from "@/lib/pos/types";

export default function POSPage(): JSX.Element {
  const currentTenant = useAuthStore((s) => s.currentTenant) ?? "motoshop";
  const user = useAuthStore((s) => s.user);
  const cashierName = user ?? "Cajero Principal";

  const setTenant = usePOSStore((s) => s.setTenant);

  // Sincronizar tenant en el store de POS para aislar el carrito y sesión
  useEffect(() => {
    setTenant(currentTenant);
  }, [currentTenant, setTenant]);

  const cart = usePOSStore((s) => s.cart);
  const addItem = usePOSStore((s) => s.addItem);
  const openSearchModal = usePOSStore((s) => s.openSearchModal);
  const openPaymentModal = usePOSStore((s) => s.openPaymentModal);
  const session = usePOSStore((s) => s.session);
  const setSession = usePOSStore((s) => s.setSession);
  const lastSale = usePOSStore((s) => s.lastSale);
  const isReceiptOpen = usePOSStore((s) => s.isReceiptOpen);
  const closeReceipt = usePOSStore((s) => s.closeReceipt);
  const customer = usePOSStore((s) => s.customer);
  const documentType = usePOSStore((s) => s.documentType);
  const setDocumentType = usePOSStore((s) => s.setDocumentType);
  const getTotals = usePOSStore((s) => s.getTotals);

  const totals = getTotals();

  // Productos para el catálogo rápido táctil
  const [quickProducts, setQuickProducts] = useState<POSProduct[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("TODOS");
  const [quickSearchInput, setQuickSearchInput] = useState<string>("");
  const [pendingSalesCount, setPendingSalesCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [activeTabMobile, setActiveTabMobile] = useState<"CATALOGO" | "CARRITO">("CATALOGO");

  // Cargar sesión activa y productos iniciales
  useEffect(() => {
    async function initPOS(): Promise<void> {
      const activeSession = await getActiveCashSession(currentTenant);
      if (activeSession && activeSession.status === "OPEN") {
        setSession(activeSession);
      }

      const products = await searchPOSProducts("", currentTenant);
      setQuickProducts(products);

      const pending = await getPendingSales();
      setPendingSalesCount(pending.length);
    }
    void initPOS();
  }, [currentTenant, setSession]);

  // Sincronizar ventas offline
  async function handleSyncPending(): Promise<void> {
    setIsSyncing(true);
    try {
      await flushPendingSales();
      const pending = await getPendingSales();
      setPendingSalesCount(pending.length);
    } finally {
      setIsSyncing(false);
    }
  }

  // Lista de categorías únicas para los filtros rápidos
  const categories = useMemo(() => {
    const set = new Set<string>();
    quickProducts.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return ["TODOS", ...Array.from(set)];
  }, [quickProducts]);

  // Filtrado de productos en catálogo rápido
  const filteredProducts = useMemo(() => {
    return quickProducts.filter((p) => {
      const matchesCategory =
        selectedCategory === "TODOS" || p.category === selectedCategory;
      const clean = quickSearchInput.trim().toLowerCase();
      const matchesSearch =
        !clean ||
        p.name.toLowerCase().includes(clean) ||
        p.sku.toLowerCase().includes(clean) ||
        (p.barcode && p.barcode.toLowerCase().includes(clean));
      return matchesCategory && matchesSearch;
    });
  }, [quickProducts, selectedCategory, quickSearchInput]);

  function handleProductCardClick(product: POSProduct): void {
    addItem(product, 1);
    playSuccessBeep();
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col bg-background pb-20 lg:pb-6">
      {/* Listener global de códigos de barras (HID < 35ms) y atajos F7/F9 */}
      <BarcodeScannerListener tenant={currentTenant} />

      {/* Barra Superior / Header de Estación de Trabajo POS */}
      <header className="sticky top-0 z-30 border-b border-border bg-surface-dark px-4 py-3 text-text-inverse shadow-sm">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          {/* Título e Indicador de Sesión de Caja */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-fg shadow-md">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-5 w-5">
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-black tracking-tight text-text-inverse">
                  Punto de Venta
                </h1>
                <span className="hidden sm:inline rounded-md bg-surface-dark-alt px-1.5 py-0.5 text-[10px] font-mono font-bold text-text-muted">
                  v2.0 POS
                </span>
              </div>

              {/* Estado de Caja */}
              <Link
                href="/pos/caja"
                className="group flex items-center gap-1.5 text-xs text-text-muted hover:text-text-inverse transition-colors"
                title="Administrar turnos y arqueos de caja"
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    session?.status === "OPEN"
                      ? "bg-emerald-400 animate-pulse"
                      : "bg-amber-400"
                  }`}
                />
                <span className="group-hover:underline">
                  {session?.status === "OPEN"
                    ? `Caja Abierta: Base ${formatMoneyFull(session.initialCash)}`
                    : "Caja cerrada • Abrir turno"}
                </span>
                <span className="text-[10px] text-primary">→</span>
              </Link>
            </div>
          </div>

          {/* Acciones y Badges de la derecha */}
          <div className="flex items-center gap-2">
            {/* Indicador de ventas offline pendientes */}
            {pendingSalesCount > 0 && (
              <button
                type="button"
                onClick={handleSyncPending}
                disabled={isSyncing}
                className="flex items-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-300 hover:bg-amber-500/20 transition-all"
                title="Sincronizar ventas offline encoladas"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`}>
                  <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>{pendingSalesCount} Offline</span>
              </button>
            )}

            {/* Selector de tipo de comprobante */}
            <div className="hidden sm:flex items-center">
              <label htmlFor="topDocTypeSelect" className="sr-only">Tipo de Documento</label>
              <select
                id="topDocTypeSelect"
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value as typeof documentType)}
                className="h-9 rounded-xl border border-surface-dark-alt bg-surface-dark-alt px-2.5 text-xs font-bold text-text-inverse focus:border-primary focus:outline-none"
              >
                <option value="FACTURA_VENTA">Factura Electrónica</option>
                <option value="POS_TICKET">Ticket POS</option>
                <option value="REMISION">Remisión</option>
                <option value="COTIZACION">Cotización</option>
              </select>
            </div>

            {/* Botón de búsqueda de producto [F7] */}
            <button
              type="button"
              onClick={openSearchModal}
              className="flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-black text-primary-fg shadow-sm hover:bg-primary-dark active:scale-95 transition-all"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-4 w-4">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
              </svg>
              <span>Buscar [F7]</span>
            </button>
          </div>
        </div>
      </header>

      {/* Selector móvil de vista (Catálogo vs Carrito) */}
      <div className="flex border-b border-border bg-surface px-4 py-2 lg:hidden">
        <div className="grid w-full grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setActiveTabMobile("CATALOGO")}
            className={`rounded-xl py-2 text-xs font-bold transition-all ${
              activeTabMobile === "CATALOGO"
                ? "bg-primary text-primary-fg shadow-xs"
                : "bg-surface-alt text-text-secondary hover:bg-border/60"
            }`}
          >
            Catálogo ({filteredProducts.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTabMobile("CARRITO")}
            className={`relative rounded-xl py-2 text-xs font-bold transition-all ${
              activeTabMobile === "CARRITO"
                ? "bg-primary text-primary-fg shadow-xs"
                : "bg-surface-alt text-text-secondary hover:bg-border/60"
            }`}
          >
            Carrito ({cart.length})
            {cart.length > 0 && (
              <span className="ml-1.5 inline-block rounded-full bg-surface-dark px-1.5 py-0.2 text-[10px] text-text-inverse">
                {formatMoneyFull(totals.total)}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Contenido Principal: Grid de 2 Columnas en Desktop */}
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col lg:flex-row gap-6 p-4">
        {/* Columna Izquierda (60%): Catálogo Táctil y Búsqueda Rápida */}
        <section
          className={`flex-1 flex-col gap-4 ${
            activeTabMobile === "CATALOGO" ? "flex" : "hidden lg:flex"
          }`}
        >
          {/* Barra de Filtros y Búsqueda en Catálogo */}
          <div className="rounded-2xl border border-border bg-surface p-4 shadow-xs space-y-3">
            <div className="relative">
              <input
                type="text"
                value={quickSearchInput}
                onChange={(e) => setQuickSearchInput(e.target.value)}
                placeholder="Filtrar por nombre, código de barras o referencia..."
                className="w-full rounded-xl border border-border bg-surface-alt px-4 py-2.5 pl-10 text-sm font-medium text-text-primary placeholder:text-text-muted focus:border-primary focus:bg-surface focus:outline-none focus:ring-2 focus:ring-primary/20 shadow-inner"
              />
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                className="absolute left-3.5 top-3 h-4 w-4 text-text-muted"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
              </svg>
              {quickSearchInput && (
                <button
                  type="button"
                  onClick={() => setQuickSearchInput("")}
                  className="absolute right-3 top-2.5 rounded-md px-1.5 py-0.5 text-xs text-text-muted hover:text-text-primary"
                >
                  Limpiar
                </button>
              )}
            </div>

            {/* Chips de Categorías */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {categories.map((cat) => {
                const isSelected = selectedCategory === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                      isSelected
                        ? "bg-surface-dark text-text-inverse shadow-xs"
                        : "bg-surface-alt text-text-secondary hover:bg-border/60 hover:text-text-primary"
                    }`}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Grid de Productos Táctiles */}
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
            {filteredProducts.map((product) => {
              const inCart = cart.find((i) => i.product.sku === product.sku);
              return (
                <button
                  key={product.sku}
                  type="button"
                  onClick={() => handleProductCardClick(product)}
                  className={`group relative flex flex-col justify-between rounded-2xl border p-3.5 text-left transition-all active:scale-95 shadow-xs hover:shadow-md ${
                    inCart
                      ? "border-primary bg-primary/5 ring-1 ring-primary/40"
                      : "border-border bg-surface hover:border-primary/50"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-1 mb-1.5">
                      <span className="font-mono text-[10px] font-bold text-text-muted bg-surface-alt px-1.5 py-0.5 rounded">
                        {product.sku}
                      </span>
                      {inCart && (
                        <span className="rounded-full bg-primary px-2 py-0.5 font-mono text-[10px] font-black text-primary-fg">
                          x{inCart.candet}
                        </span>
                      )}
                    </div>
                    <h3 className="line-clamp-2 text-xs font-bold text-text-primary group-hover:text-primary transition-colors leading-tight">
                      {product.name}
                    </h3>
                    <p className="mt-1 text-[11px] text-text-muted">
                      {product.brand ?? product.category}
                    </p>
                  </div>

                  <div className="mt-3 flex items-baseline justify-between pt-2 border-t border-border/50">
                    <span className="text-sm font-black text-primary">
                      {formatMoneyFull(product.price)}
                    </span>
                    <span className="text-[10px] text-text-muted">
                      Stock: {product.stock ?? "—"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Columna Derecha (40%): Panel del Carrito y Liquidación */}
        <section
          className={`flex-col gap-4 lg:w-[420px] shrink-0 ${
            activeTabMobile === "CARRITO" ? "flex" : "hidden lg:flex"
          }`}
        >
          {/* Card del Carrito */}
          <div className="flex flex-col rounded-3xl border border-border bg-surface p-4 shadow-sm">
            {/* Cabecera del Carrito con Cliente */}
            <div className="flex items-center justify-between border-b border-border pb-3 mb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
                  Cliente Asignado
                </span>
                <p className="text-sm font-bold text-text-primary leading-tight">
                  {customer.name}
                </p>
                <p className="font-mono text-xs text-text-muted">NIT: {customer.nit}</p>
              </div>

              <div className="text-right">
                <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
                  Cajero
                </span>
                <p className="text-xs font-semibold text-text-secondary">{cashierName}</p>
              </div>
            </div>

            {/* Listado de Productos en el Carrito */}
            <div className="flex-1 max-h-[460px] overflow-y-auto pr-1">
              <CartItemList onOpenSearch={openSearchModal} />
            </div>

            {/* Desglose de Totales */}
            {cart.length > 0 && (
              <div className="mt-4 border-t border-border pt-4 space-y-2">
                <div className="flex justify-between text-xs text-text-secondary">
                  <span>Subtotal ({totals.itemCount} unds):</span>
                  <span className="font-semibold">{formatMoneyFull(totals.subtotal)}</span>
                </div>

                {totals.totalDiscount > 0 && (
                  <div className="flex justify-between text-xs text-amber-700">
                    <span>Descuentos aplicados:</span>
                    <span className="font-bold">-{formatMoneyFull(totals.totalDiscount)}</span>
                  </div>
                )}

                {totals.totalVat > 0 && (
                  <div className="flex justify-between text-xs text-text-secondary">
                    <span>IVA discriminado:</span>
                    <span className="font-semibold">+{formatMoneyFull(totals.totalVat)}</span>
                  </div>
                )}

                <div className="flex items-baseline justify-between border-t border-border pt-2">
                  <span className="text-base font-black text-text-primary">
                    TOTAL A PAGAR:
                  </span>
                  <span className="text-2xl font-black text-primary">
                    {formatMoneyFull(totals.total)}
                  </span>
                </div>

                {/* Botón Principal de Cobro Desktop */}
                <button
                  type="button"
                  onClick={openPaymentModal}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-base font-black text-primary-fg shadow-lg hover:bg-primary-dark active:scale-95 transition-all"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-5 w-5">
                    <rect x="2" y="5" width="20" height="14" rx="2" />
                    <line x1="2" y1="10" x2="22" y2="10" />
                  </svg>
                  <span>Cobrar {formatMoneyFull(totals.total)} [F9]</span>
                </button>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Barra Inferior Flotante en Móviles (< lg) para Cobro Rápido */}
      {cart.length > 0 && (
        <aside
          aria-label="Resumen de compra y pago rápido"
          className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-surface-dark px-4 py-3 text-text-inverse shadow-2xl lg:hidden"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase text-text-muted">
                {cart.length} ítems • {totals.itemCount} unds
              </div>
              <div className="text-xl font-black text-primary">
                {formatMoneyFull(totals.total)}
              </div>
            </div>

            <button
              type="button"
              onClick={openPaymentModal}
              className="flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-black text-primary-fg shadow-md active:scale-95 transition-all"
            >
              <span>Cobrar</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-4 w-4">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        </aside>
      )}

      {/* Modales Especializados */}
      <ProductSearchModal tenant={currentTenant} />
      <PaymentModal
        tenant={currentTenant}
        cashierName={cashierName}
        onSaleComplete={() => {
          // Actualizar conteos
        }}
      />
      {isReceiptOpen && lastSale && (
        <ReceiptPrint
          sale={lastSale}
          tenant={currentTenant}
          onClose={closeReceipt}
        />
      )}
    </div>
  );
}
