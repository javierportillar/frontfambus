"use client";

import { useEffect, useRef, useState, useId } from "react";
import { usePOSStore } from "@/lib/pos/store";
import { searchPOSProducts } from "@/lib/api/pos";
import { formatMoneyFull } from "@/lib/format/currency";
import { playSuccessBeep } from "./BarcodeScannerListener";
import type { POSProduct } from "@/lib/pos/types";

interface ProductSearchModalProps {
  tenant?: string;
}

export function ProductSearchModal({ tenant }: ProductSearchModalProps): JSX.Element | null {
  const isSearchModalOpen = usePOSStore((s) => s.isSearchModalOpen);
  const closeSearchModal = usePOSStore((s) => s.closeSearchModal);
  const addItem = usePOSStore((s) => s.addItem);
  const titleId = useId();

  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<POSProduct[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  // Cargar catálogo / realizar búsqueda
  useEffect(() => {
    let active = true;
    setIsLoading(true);

    const timeout = setTimeout(async () => {
      try {
        const results = await searchPOSProducts(query, tenant);
        if (active) {
          setProducts(results);
          setSelectedIndex(0);
        }
      } finally {
        if (active) setIsLoading(false);
      }
    }, query ? 120 : 0);

    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [query, tenant]);

  // Manejo de apertura del <dialog> nativo con showModal() según modern-web-guidance
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isSearchModalOpen) {
      if (!dialog.open) {
        dialog.showModal();
        setQuery("");
        setSelectedIndex(0);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    } else {
      if (dialog.open) {
        dialog.close();
      }
    }
  }, [isSearchModalOpen]);

  // Fallback para light-dismiss en navegadores que no soportan closedby="any"
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    function handleClickOutside(event: MouseEvent): void {
      if (!dialog || event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      const isInside =
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width;
      if (!isInside) {
        closeSearchModal();
      }
    }

    dialog.addEventListener("click", handleClickOutside);
    return () => dialog.removeEventListener("click", handleClickOutside);
  }, [closeSearchModal]);

  // Asegurar que el elemento seleccionado esté visible en el scroll
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const selectedEl = list.children[selectedIndex] as HTMLElement | undefined;
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedIndex]);

  function handleSelectProduct(product: POSProduct): void {
    addItem(product, 1);
    playSuccessBeep();
    // Efecto sutil: mantenemos abierto si el usuario desea agregar más, o cerramos con Escape
  }

  function handleKeyDown(e: React.KeyboardEvent): void {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (products.length ? (prev + 1) % products.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) =>
        products.length ? (prev - 1 + products.length) % products.length : 0,
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (products[selectedIndex]) {
        handleSelectProduct(products[selectedIndex]);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeSearchModal();
    }
  }

  if (!isSearchModalOpen) return null;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 m-auto flex h-[90vh] max-h-[680px] w-[95vw] max-w-2xl flex-col overflow-hidden rounded-2xl border border-border/80 bg-surface text-text-primary shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-sm p-0 animate-in fade-in zoom-in-95 duration-150"
      onCancel={(e) => {
        e.preventDefault();
        closeSearchModal();
      }}
    >
      {/* Cabecera del buscador */}
      <div className="border-b border-border bg-surface-alt px-5 py-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-4 w-4">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
              </svg>
            </div>
            <div>
              <h2 id={titleId} className="text-base font-bold text-text-primary leading-tight">
                Búsqueda Rápida de Productos
              </h2>
              <p className="text-xs text-text-muted">
                Filtra por nombre, referencia SKU o código de barras
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeSearchModal}
            className="rounded-lg p-1.5 text-text-muted hover:bg-surface hover:text-text-primary"
            aria-label="Cerrar modal"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Campo de búsqueda */}
        <div className="relative mt-3">
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escribe para buscar... (ej. Aceite, Casco, 770...)"
            className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 pl-10 text-sm font-medium text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 shadow-sm"
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
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              className="absolute right-3 top-2.5 rounded-md px-1.5 py-0.5 text-xs text-text-muted hover:text-text-primary"
            >
              Borrar
            </button>
          )}
        </div>
      </div>

      {/* Lista de resultados */}
      <div className="flex-1 overflow-y-auto p-3">
        {isLoading && products.length === 0 ? (
          <div className="flex h-48 items-center justify-center text-sm text-text-muted">
            Buscando productos...
          </div>
        ) : products.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center text-center p-6">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              className="h-12 w-12 text-text-muted/60 mb-2"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
            </svg>
            <p className="font-semibold text-text-primary">No se encontraron productos</p>
            <p className="text-xs text-text-muted mt-1">
              Verifica el término de búsqueda o el código escaneado
            </p>
          </div>
        ) : (
          <ul ref={listRef} className="space-y-1.5" role="listbox">
            {products.map((product, idx) => {
              const isSelected = idx === selectedIndex;
              const hasStock = (product.stock ?? 1) > 0;

              return (
                <li
                  key={product.sku}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    setSelectedIndex(idx);
                    handleSelectProduct(product);
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`group flex items-center justify-between rounded-xl p-3 transition-colors cursor-pointer border ${
                    isSelected
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-transparent hover:bg-surface-alt"
                  }`}
                >
                  <div className="min-w-0 flex-1 pr-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs font-bold text-text-secondary bg-surface-dark-alt/10 px-1.5 py-0.5 rounded">
                        {product.sku}
                      </span>
                      {product.brand && (
                        <span className="text-[11px] font-semibold text-text-muted">
                          {product.brand}
                        </span>
                      )}
                      {product.barcode && (
                        <span className="hidden sm:inline font-mono text-[10px] text-text-muted">
                          [{product.barcode}]
                        </span>
                      )}
                      <span
                        className={`text-[10px] font-semibold px-1.5 py-0.2 rounded-full ${
                          hasStock
                            ? "bg-emerald-500/10 text-emerald-700"
                            : "bg-rose-500/10 text-rose-700"
                        }`}
                      >
                        {hasStock ? `Stock: ${product.stock ?? "Disp."}` : "Agotado"}
                      </span>
                    </div>

                    <p className="truncate text-sm font-semibold text-text-primary">
                      {product.name}
                    </p>

                    <div className="flex items-center gap-2 mt-0.5 text-xs text-text-muted">
                      <span>{product.category ?? "General"}</span>
                      {product.vatPct !== undefined && product.vatPct > 0 && (
                        <span>• IVA {product.vatPct}%</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <div className="text-base font-extrabold text-primary">
                        {formatMoneyFull(product.price)}
                      </div>
                      <span className="text-[10px] text-text-muted">
                        /{product.unit ?? "UND"}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectProduct(product);
                      }}
                      className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-fg shadow-sm hover:bg-primary-dark active:scale-95 transition-all"
                    >
                      + Agregar
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Footer con atajos de teclado */}
      <div className="border-t border-border bg-surface-alt px-5 py-2.5">
        <div className="flex flex-wrap items-center justify-between text-xs text-text-muted">
          <div className="flex items-center gap-4">
            <span>
              <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[11px] shadow-xs">
                ↑/↓
              </kbd>{" "}
              Navegar
            </span>
            <span>
              <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[11px] shadow-xs">
                Enter
              </kbd>{" "}
              Agregar al carrito
            </span>
            <span>
              <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[11px] shadow-xs">
                Esc
              </kbd>{" "}
              Cerrar
            </span>
          </div>
          <span className="text-[11px] text-text-muted">
            {products.length} productos disponibles
          </span>
        </div>
      </div>
    </dialog>
  );
}
