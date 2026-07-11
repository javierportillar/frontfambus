"use client";

import { useEffect, useRef, useState } from "react";
import { mutate } from "swr";
import { useAuthStore } from "@/lib/auth/store";

// V1.34: tras cada deploy, el backend re-descarga su DuckDB desde R2 (~1 min).
// Durante esa ventana las métricas devuelven 503 {status:"loading"}. Este banner
// consulta /api/health/ready y muestra un estado claro "servidor cargando" en vez
// de dejar la app en blanco. Cuando el backend queda listo, se oculta y SWR
// (que reintenta solo) vuelve a cargar los datos.

type Estado = "checking" | "loading" | "ready";

const POLL_MS = 3000;

export function ServerLoadingBanner(): JSX.Element | null {
  const currentTenant = useAuthStore((s) => s.currentTenant);
  const [estado, setEstado] = useState<Estado>("checking");
  const [segundos, setSegundos] = useState(0);
  const startRef = useRef<number | null>(null);
  const wasLoadingRef = useRef(false); // evita leer `estado` (stale) dentro del async

  useEffect(() => {
    if (!currentTenant) return;
    let cancelado = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function chequear(): Promise<void> {
      try {
        const r = await fetch(`/api/health/ready?tenant=${encodeURIComponent(currentTenant ?? "")}`, {
          cache: "no-store",
        });
        const data = (await r.json().catch(() => null)) as { ready?: boolean } | null;
        if (cancelado) return;
        if (data?.ready) {
          setEstado("ready");
          // Si veníamos de la ventana de carga, forzamos revalidación global de
          // SWR para que TODAS las vistas recarguen ya (sin esperar reintentos).
          if (wasLoadingRef.current) mutate(() => true, undefined, { revalidate: true });
          wasLoadingRef.current = false;
          return; // listo: dejamos de pollear
        }
        // no listo → mostrar banner y seguir chequeando
        if (startRef.current === null) startRef.current = Date.now();
        wasLoadingRef.current = true;
        setSegundos(Math.round((Date.now() - startRef.current) / 1000));
        setEstado("loading");
        timer = setTimeout(chequear, POLL_MS);
      } catch {
        if (cancelado) return;
        // si el propio readiness no responde, asumimos que aún arranca
        if (startRef.current === null) startRef.current = Date.now();
        wasLoadingRef.current = true;
        setSegundos(Math.round((Date.now() - startRef.current) / 1000));
        setEstado("loading");
        timer = setTimeout(chequear, POLL_MS);
      }
    }

    chequear();
    return () => {
      cancelado = true;
      if (timer) clearTimeout(timer);
    };
  }, [currentTenant]);

  if (estado !== "loading") return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-50 flex items-center gap-3 border-b border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 shadow-sm"
    >
      <span
        className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-amber-400 border-t-transparent"
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <span className="font-semibold">El servidor está cargando los datos…</span>{" "}
        <span className="text-amber-800">
          Ocurre unos segundos después de cada actualización. Reintentando solo — no cierres la app.
        </span>
      </div>
      <span className="shrink-0 tabular-nums text-xs text-amber-700">{segundos}s</span>
    </div>
  );
}
