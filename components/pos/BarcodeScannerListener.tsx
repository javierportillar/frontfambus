"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { usePOSStore } from "@/lib/pos/store";
import { findPOSProductByBarcode } from "@/lib/api/pos";
import { formatMoneyFull } from "@/lib/format/currency";
import type { POSProduct } from "@/lib/pos/types";

interface BarcodeScannerListenerProps {
  tenant?: string;
  onUnknownBarcode?: (barcode: string) => void;
}

// ─── Web Audio API Generator para Beeps ─────────────────────────

let globalAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!globalAudioCtx) {
    const AudioCtxClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioCtxClass) {
      globalAudioCtx = new AudioCtxClass();
    }
  }
  if (globalAudioCtx && globalAudioCtx.state === "suspended") {
    globalAudioCtx.resume().catch(() => {});
  }
  return globalAudioCtx;
}

export function playSuccessBeep(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime); // 880Hz (A5)

    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  } catch {
    // Audio no soportado o bloqueado por navegador
  }
}

export function playErrorTone(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(300, ctx.currentTime); // 300Hz tono grave de advertencia

    gain.gain.setValueAtTime(0.14, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.22);
  } catch {
    // Audio no soportado o bloqueado
  }
}

export function BarcodeScannerListener({
  tenant,
  onUnknownBarcode,
}: BarcodeScannerListenerProps): JSX.Element {
  const addItem = usePOSStore((s) => s.addItem);
  const openSearchModal = usePOSStore((s) => s.openSearchModal);
  const openPaymentModal = usePOSStore((s) => s.openPaymentModal);
  const cart = usePOSStore((s) => s.cart);
  const setScannedNotification = usePOSStore((s) => s.setScannedNotification);

  const [lastScanned, setLastScanned] = useState<POSProduct | null>(null);
  const [notificationVisible, setNotificationVisible] = useState(false);
  const [unknownBarcodeAlert, setUnknownBarcodeAlert] = useState<string | null>(null);

  // Buffer para capturar ráfagas rápidas de escáner HID
  const bufferRef = useRef<Array<{ char: string; time: number }>>([]);

  const handleBarcodeDetected = useCallback(
    async (barcode: string) => {
      const storeState = usePOSStore.getState();
      if (storeState.isPaymentModalOpen || storeState.isReceiptOpen) {
        return;
      }

      const cleanCode = barcode.trim();
      if (!cleanCode) return;

      const product = await findPOSProductByBarcode(cleanCode, tenant);
      if (product) {
        addItem(product, 1);
        playSuccessBeep();
        setLastScanned(product);
        setNotificationVisible(true);
        setUnknownBarcodeAlert(null);
        setScannedNotification(product);
      } else {
        playErrorTone();
        setUnknownBarcodeAlert(cleanCode);
        onUnknownBarcode?.(cleanCode);
      }
    },
    [addItem, onUnknownBarcode, setScannedNotification, tenant],
  );

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      // Si el modal de pago o el recibo están abiertos, ignorar eventos para proteger el checkout
      const storeState = usePOSStore.getState();
      if (storeState.isPaymentModalOpen || storeState.isReceiptOpen) {
        return;
      }

      // Atajo F7: Abrir búsqueda de productos
      if (e.key === "F7") {
        e.preventDefault();
        openSearchModal();
        return;
      }

      // Atajo F9: Proceder a cobrar si hay items en el carrito
      if (e.key === "F9" && cart.length > 0) {
        e.preventDefault();
        openPaymentModal();
        return;
      }

      const now = performance.now();

      // Cuando se presiona Enter, evaluar si los caracteres vinieron a alta velocidad de un escáner
      if (e.key === "Enter") {
        const buffer = bufferRef.current;
        if (buffer.length >= 3) {
          // Calcular la media de intervalos entre teclas
          let totalInterval = 0;
          for (let i = 1; i < buffer.length; i++) {
            totalInterval += buffer[i]!.time - buffer[i - 1]!.time;
          }
          const avgInterval = totalInterval / (buffer.length - 1);

          // Los escáneres HID envían caracteres a < 40ms entre pulsaciones
          if (avgInterval < 45) {
            e.preventDefault();
            e.stopPropagation();
            const scannedCode = buffer.map((b) => b.char).join("");
            bufferRef.current = [];
            void handleBarcodeDetected(scannedCode);
            return;
          }
        }
        bufferRef.current = [];
        return;
      }

      // Descartar caracteres si pasaron más de 1.5s desde el último
      if (
        bufferRef.current.length > 0 &&
        now - bufferRef.current[bufferRef.current.length - 1]!.time > 1500
      ) {
        bufferRef.current = [];
      }

      // Capturar solo caracteres imprimibles
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        bufferRef.current.push({ char: e.key, time: now });
        if (bufferRef.current.length > 60) {
          bufferRef.current.shift();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
    };
  }, [cart.length, handleBarcodeDetected, openPaymentModal, openSearchModal]);

  // Temporizador para auto-ocultar notificación de escaneo
  useEffect(() => {
    if (notificationVisible) {
      const timer = setTimeout(() => {
        setNotificationVisible(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [notificationVisible]);

  // Temporizador para auto-ocultar alerta de código desconocido
  useEffect(() => {
    if (unknownBarcodeAlert) {
      const timer = setTimeout(() => {
        setUnknownBarcodeAlert(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [unknownBarcodeAlert]);

  return (
    <>
      {/* Toast flotante de producto agregado vía escáner */}
      {notificationVisible && lastScanned && (
        <aside
          aria-live="polite"
          className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 transform rounded-2xl border border-emerald-500/40 bg-surface-dark/95 px-4 py-3 text-text-inverse shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-4 duration-200"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-5 w-5">
                <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="min-w-0 pr-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-emerald-400">
                  {lastScanned.sku}
                </span>
                <span className="text-xs text-text-muted">• {lastScanned.unit ?? "UNIDAD"}</span>
              </div>
              <p className="truncate text-sm font-semibold text-text-inverse max-w-[280px] sm:max-w-[400px]">
                {lastScanned.name}
              </p>
            </div>
            <span className="text-sm font-black text-emerald-400">
              +{formatMoneyFull(lastScanned.price)}
            </span>
          </div>
        </aside>
      )}

      {/* Alerta de código no encontrado */}
      {unknownBarcodeAlert && (
        <aside
          role="alert"
          aria-live="assertive"
          className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 transform rounded-2xl border border-rose-500/40 bg-surface-dark/95 px-4 py-3 text-text-inverse shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-4 duration-200"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-500/20 text-rose-400">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-5 w-5">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <div className="min-w-0 pr-2">
              <p className="text-xs font-bold text-rose-400">CÓDIGO NO REGISTRADO</p>
              <p className="truncate font-mono text-sm text-text-inverse">
                {unknownBarcodeAlert}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setUnknownBarcodeAlert(null);
                openSearchModal();
              }}
              className="rounded-lg bg-rose-500/20 px-2.5 py-1 text-xs font-bold text-rose-300 hover:bg-rose-500/30"
            >
              Buscar [F7]
            </button>
          </div>
        </aside>
      )}
    </>
  );
}
