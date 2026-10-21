"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePOSStore } from "@/lib/pos/store";
import { useAuthStore } from "@/lib/auth/store";
import {
  getActiveCashSession,
  saveCashSession,
  recordCashMovement,
} from "@/lib/api/pos";
import {
  calculateArqueoTotal,
  calculateCashBalance,
  calculateDifference,
} from "@/lib/pos/calculations";
import { formatMoneyFull } from "@/lib/format/currency";
import {
  COLOMBIAN_DENOMINATIONS,
  type CashMovement,
  type CashSession,
  type ColombianDenomination,
  type DenominationCount,
} from "@/lib/pos/types";

export default function CajaManagementPage(): JSX.Element {
  const currentTenant = useAuthStore((s) => s.currentTenant) ?? "motoshop";
  const user = useAuthStore((s) => s.user);
  const defaultCashier = user ?? "Cajero Principal";

  const session = usePOSStore((s) => s.session);
  const setSession = usePOSStore((s) => s.setSession);
  const addMovementToSession = usePOSStore((s) => s.addMovementToSession);

  // Estados para abrir sesión
  const [initialCashInput, setInitialCashInput] = useState<number>(100000);
  const [registerNameInput, setRegisterNameInput] = useState<string>("Caja 1 - Principal");

  // Estado para movimientos (Ingreso / Egreso)
  const [isMovementModalOpen, setIsMovementModalOpen] = useState(false);
  const [movementType, setMovementType] = useState<"INGRESO" | "EGRESO">("INGRESO");
  const [movementAmount, setMovementAmount] = useState<number>(20000);
  const [movementReason, setMovementReason] = useState<string>("");

  // Estado de Arqueo de Denominaciones
  const [denominationCounts, setDenominationCounts] = useState<Partial<DenominationCount>>({
    100000: 0,
    50000: 0,
    20000: 0,
    10000: 0,
    5000: 0,
    2000: 0,
    1000: 0,
    500: 0,
    200: 0,
    100: 0,
    50: 0,
  });
  const [closingNotes, setClosingNotes] = useState<string>("");
  const [showArqueoSection, setShowArqueoSection] = useState<boolean>(false);
  const [isClosedSummaryVisible, setIsClosedSummaryVisible] = useState<boolean>(false);
  const [lastClosedSession, setLastClosedSession] = useState<CashSession | null>(null);

  // Cargar sesión persistida
  useEffect(() => {
    async function load(): Promise<void> {
      const active = await getActiveCashSession(currentTenant);
      if (active) {
        setSession(active);
      }
    }
    void load();
  }, [currentTenant, setSession]);

  // Manejo accesible de tecla Escape para cerrar modales
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        if (isMovementModalOpen) setIsMovementModalOpen(false);
        if (isClosedSummaryVisible) setIsClosedSummaryVisible(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isClosedSummaryVisible, isMovementModalOpen]);

  // Manejar conteo de denominación
  function handleCountChange(denomination: ColombianDenomination, count: number): void {
    setDenominationCounts((prev) => ({
      ...prev,
      [denomination]: Math.max(0, count || 0),
    }));
  }

  // Cálculos en vivo
  const totalContado = calculateArqueoTotal(denominationCounts);

  const balance = session
    ? calculateCashBalance(
        session.initialCash,
        session.movements,
        session.salesSummary.totalCashSales,
      )
    : { totalIngresos: 0, totalEgresos: 0, expectedCash: 0 };

  const diffResult = calculateDifference(totalContado, balance.expectedCash);

  // Abrir nueva sesión
  async function handleOpenSession(): Promise<void> {
    const newSession: CashSession = {
      id: `ses-${Date.now()}`,
      tenant: currentTenant,
      cashier: defaultCashier,
      registerName: registerNameInput.trim() || "Caja Principal",
      status: "OPEN",
      openedAt: new Date().toISOString(),
      initialCash: Math.max(0, initialCashInput),
      movements: [
        {
          id: `mov-init-${Date.now()}`,
          sessionId: `ses-${Date.now()}`,
          type: "BASE_INICIAL",
          amount: Math.max(0, initialCashInput),
          reason: "Apertura de turno - Base de efectivo inicial",
          cashier: defaultCashier,
          createdAt: new Date().toISOString(),
        },
      ],
      salesSummary: {
        totalCashSales: 0,
        totalElectronicSales: 0,
        totalCreditSales: 0,
        totalSales: 0,
        salesCount: 0,
        totalIngresos: 0,
        totalEgresos: 0,
      },
      expectedCash: Math.max(0, initialCashInput),
    };

    await saveCashSession(newSession);
    setSession(newSession);
    setShowArqueoSection(false);
  }

  // Registrar movimiento
  async function handleAddMovement(): Promise<void> {
    if (!session || movementAmount <= 0 || !movementReason.trim()) return;

    const movement: CashMovement = await recordCashMovement(
      session.id,
      movementType,
      movementAmount,
      movementReason.trim(),
      defaultCashier,
    );

    addMovementToSession(movement);

    // Persistir
    const updatedMovements = [...session.movements, movement];
    const newExpected =
      movementType === "INGRESO"
        ? (session.expectedCash ?? 0) + movementAmount
        : (session.expectedCash ?? 0) - movementAmount;

    await saveCashSession({
      ...session,
      movements: updatedMovements,
      expectedCash: newExpected,
    });

    setIsMovementModalOpen(false);
    setMovementReason("");
    setMovementAmount(20000);
  }

  // Confirmar Cierre de Caja
  async function handleConfirmCloseSession(): Promise<void> {
    if (!session) return;
    if (
      !window.confirm(
        `¿Confirmas el cierre del turno de caja?\nEfectivo contado: ${formatMoneyFull(
          totalContado,
        )}\nEsperado: ${formatMoneyFull(balance.expectedCash)}\nDiferencia: ${formatMoneyFull(
          diffResult.difference,
        )}`,
      )
    ) {
      return;
    }

    const closedSession: CashSession = {
      ...session,
      status: "CLOSED",
      closedAt: new Date().toISOString(),
      closingCount: denominationCounts,
      expectedCash: balance.expectedCash,
      countedCash: totalContado,
      difference: diffResult.difference,
      closingNotes: closingNotes.trim() || undefined,
    };

    await saveCashSession(closedSession);
    setLastClosedSession(closedSession);
    setIsClosedSummaryVisible(true);
    setSession(null);
    setShowArqueoSection(false);
  }

  return (
    <div className="mx-auto min-h-[calc(100vh-4rem)] max-w-6xl p-4 lg:p-8 space-y-6 bg-background">
      {/* Cabecera */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <Link
            href="/pos"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface text-text-secondary hover:bg-surface-alt hover:text-text-primary transition-colors"
            title="Volver al POS"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-5 w-5">
              <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          <div>
            <h1 className="text-xl font-black text-text-primary leading-tight">
              Control de Caja y Arqueos
            </h1>
            <p className="text-xs text-text-muted">
              Apertura de turno, movimientos de efectivo y cuadre de caja
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/pos"
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-fg shadow-sm hover:bg-primary-dark transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
            </svg>
            <span>Ir al Mostrador POS</span>
          </Link>
        </div>
      </div>

      {/* Si no hay sesión activa: Formulario de Apertura de Turno */}
      {!session ? (
        <div className="mx-auto max-w-xl rounded-3xl border border-border bg-surface p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-600">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-6 w-6">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0110 0v4" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-bold text-text-primary">
                Caja Cerrada • Iniciar Nuevo Turno
              </h2>
              <p className="text-xs text-text-muted">
                Ingresa la base inicial de efectivo con la que comienzas el turno
              </p>
            </div>
          </div>

          <div className="space-y-4 pt-2">
            <div>
              <label htmlFor="regInput" className="block text-xs font-bold text-text-secondary uppercase mb-1">
                Nombre de la Caja / Terminal
              </label>
              <input
                id="regInput"
                type="text"
                value={registerNameInput}
                onChange={(e) => setRegisterNameInput(e.target.value)}
                placeholder="Caja 1 - Principal"
                className="w-full rounded-xl border border-border bg-surface-alt px-4 py-2.5 text-sm font-semibold text-text-primary focus:border-primary focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="baseCashInput" className="block text-xs font-bold text-text-secondary uppercase mb-1">
                Base Inicial de Efectivo (COP)
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-2.5 text-base font-bold text-text-muted">
                  $
                </span>
                <input
                  id="baseCashInput"
                  type="number"
                  step="1000"
                  value={initialCashInput || ""}
                  onChange={(e) => setInitialCashInput(parseInt(e.target.value, 10) || 0)}
                  placeholder="100000"
                  className="w-full rounded-xl border border-border bg-surface-alt px-4 py-2.5 pl-8 text-lg font-black text-text-primary focus:border-primary focus:outline-none"
                />
              </div>

              {/* Botones de base rápida */}
              <div className="flex gap-2 mt-2">
                {[50000, 100000, 200000].map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => setInitialCashInput(b)}
                    className="rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-bold text-text-secondary hover:bg-surface-alt"
                  >
                    {formatMoneyFull(b)}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={handleOpenSession}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-black text-primary-fg shadow-lg hover:bg-primary-dark transition-all active:scale-95"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-5 w-5">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                <span>Abrir Turno de Caja ({formatMoneyFull(initialCashInput)})</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Sesión Abierta: Cuadro de Mando y Arqueo */
        <div className="space-y-6">
          {/* Banner de Estado del Turno */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="rounded-3xl border border-border bg-surface p-4 shadow-xs">
              <div className="flex items-center gap-2 text-xs font-bold text-text-muted uppercase">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                Estado del Turno
              </div>
              <div className="mt-2 text-lg font-black text-emerald-600">
                Turno Abierto
              </div>
              <div className="mt-1 text-xs text-text-muted">
                {session.registerName} • {session.cashier}
              </div>
              <div className="text-[11px] text-text-muted mt-0.5">
                Desde: {new Date(session.openedAt).toLocaleTimeString("es-CO")}
              </div>
            </div>

            <div className="rounded-3xl border border-border bg-surface p-4 shadow-xs">
              <span className="text-xs font-bold text-text-muted uppercase">
                Base Inicial
              </span>
              <div className="mt-2 text-lg font-black text-text-primary">
                {formatMoneyFull(session.initialCash)}
              </div>
              <div className="mt-1 text-xs text-text-muted">
                Efectivo de inicio
              </div>
            </div>

            <div className="rounded-3xl border border-border bg-surface p-4 shadow-xs">
              <span className="text-xs font-bold text-text-muted uppercase">
                Ventas en Efectivo
              </span>
              <div className="mt-2 text-lg font-black text-primary">
                {formatMoneyFull(session.salesSummary.totalCashSales)}
              </div>
              <div className="mt-1 text-xs text-text-muted">
                {session.salesSummary.salesCount} ventas registradas
              </div>
            </div>

            <div className="rounded-3xl border border-emerald-500/40 bg-emerald-500/5 p-4 shadow-xs">
              <span className="text-xs font-bold text-emerald-700 uppercase">
                Saldo Esperado en Caja
              </span>
              <div className="mt-2 text-2xl font-black text-emerald-700">
                {formatMoneyFull(balance.expectedCash)}
              </div>
              <div className="mt-1 text-[11px] text-emerald-800">
                Base + Ventas + Ingresos - Egresos
              </div>
            </div>
          </div>

          {/* Botones de Acciones Rápidas */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setMovementType("INGRESO");
                setIsMovementModalOpen(true);
              }}
              className="flex items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-2.5 text-xs font-bold text-text-primary shadow-xs hover:bg-surface-alt transition-colors"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-700 font-bold">
                +
              </span>
              <span>Ingreso de Efectivo</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setMovementType("EGRESO");
                setIsMovementModalOpen(true);
              }}
              className="flex items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-2.5 text-xs font-bold text-text-primary shadow-xs hover:bg-surface-alt transition-colors"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-rose-500/20 text-rose-700 font-bold">
                –
              </span>
              <span>Egreso / Retiro de Dinero</span>
            </button>

            <button
              type="button"
              onClick={() => setShowArqueoSection(!showArqueoSection)}
              className={`flex items-center gap-2 rounded-2xl px-5 py-2.5 text-xs font-bold transition-all shadow-xs ${
                showArqueoSection
                  ? "bg-surface-dark text-text-inverse"
                  : "bg-primary text-primary-fg hover:bg-primary-dark"
              }`}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
                <rect x="2" y="6" width="20" height="12" rx="2" />
                <circle cx="12" cy="12" r="2" />
              </svg>
              <span>{showArqueoSection ? "Ocultar Arqueo" : "Hacer Arqueo y Cierre"}</span>
            </button>
          </div>

          {/* Sección de Conteo de Denominaciones (Arqueo) */}
          {showArqueoSection && (
            <div className="rounded-3xl border border-border bg-surface p-6 shadow-md space-y-6 animate-in fade-in duration-200">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
                <div>
                  <h3 className="text-base font-black text-text-primary">
                    Conteo de Denominaciones (Arqueo Físico)
                  </h3>
                  <p className="text-xs text-text-muted">
                    Digita la cantidad de billetes y monedas que hay físicamente en la gaveta
                  </p>
                </div>

                {/* Diferencia en vivo */}
                <div
                  className={`rounded-2xl border px-4 py-2.5 text-right ${
                    diffResult.status === "EXACT"
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-800"
                      : diffResult.status === "SURPLUS"
                      ? "border-sky-500/40 bg-sky-500/10 text-sky-800"
                      : "border-rose-500/40 bg-rose-500/10 text-rose-800"
                  }`}
                >
                  <div className="text-[10px] font-bold uppercase tracking-wider">
                    {diffResult.status === "EXACT"
                      ? "Cuadre Perfecto"
                      : diffResult.status === "SURPLUS"
                      ? "Sobrante de Efectivo"
                      : "Faltante de Efectivo"}
                  </div>
                  <div className="text-lg font-black">
                    {diffResult.difference > 0 ? "+" : ""}
                    {formatMoneyFull(diffResult.difference)}
                  </div>
                </div>
              </div>

              {/* Grid de Billetes y Monedas */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {COLOMBIAN_DENOMINATIONS.map((item) => {
                  const count = denominationCounts[item.value] || 0;
                  const lineTotal = item.value * count;

                  return (
                    <div
                      key={item.value}
                      className="flex items-center justify-between rounded-2xl border border-border bg-surface-alt/60 p-3"
                    >
                      <div className="min-w-0 pr-2">
                        <span
                          className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                            item.type === "bill"
                              ? "bg-emerald-500/15 text-emerald-800"
                              : "bg-amber-500/15 text-amber-800"
                          }`}
                        >
                          {item.type === "bill" ? "Billete" : "Moneda"}
                        </span>
                        <div className="font-mono text-sm font-black text-text-primary mt-0.5">
                          {formatMoneyFull(item.value)}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <label htmlFor={`denom-${item.value}`} className="sr-only">
                          Cantidad de {item.value}
                        </label>
                        <input
                          id={`denom-${item.value}`}
                          type="number"
                          min="0"
                          value={count || ""}
                          onChange={(e) =>
                            handleCountChange(
                              item.value,
                              parseInt(e.target.value, 10) || 0,
                            )
                          }
                          placeholder="0"
                          className="w-16 rounded-xl border border-border bg-surface px-2 py-1.5 text-center font-bold text-sm text-text-primary focus:border-primary focus:outline-none"
                        />
                        <div className="w-20 text-right font-mono text-xs font-semibold text-text-muted">
                          {formatMoneyFull(lineTotal)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Totales del Arqueo y Botón de Cierre */}
              <div className="rounded-2xl border border-border bg-surface-alt p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="space-y-1 text-center sm:text-left">
                  <div className="text-xs text-text-muted">
                    Total Dinero Físico en Caja:
                  </div>
                  <div className="text-2xl font-black text-primary">
                    {formatMoneyFull(totalContado)}
                  </div>
                  <div className="text-xs text-text-muted">
                    Esperado en sistema: {formatMoneyFull(balance.expectedCash)}
                  </div>
                </div>

                <div className="w-full sm:w-auto space-y-2">
                  <input
                    type="text"
                    value={closingNotes}
                    onChange={(e) => setClosingNotes(e.target.value)}
                    placeholder="Observaciones de cierre (opcional)..."
                    className="w-full sm:w-80 rounded-xl border border-border bg-surface px-3 py-2 text-xs focus:border-primary focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleConfirmCloseSession}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-xs font-black text-primary-fg shadow-lg hover:bg-primary-dark transition-all active:scale-95"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-4 w-4">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0110 0v4" />
                    </svg>
                    <span>Cerrar Turno de Caja Definitivamente</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Historial de Movimientos de la Sesión */}
          <div className="rounded-3xl border border-border bg-surface p-6 shadow-xs space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-text-muted">
              Movimientos del Turno ({session.movements.length})
            </h3>

            {session.movements.length === 0 ? (
              <p className="text-xs text-text-muted">No hay movimientos registrados aún.</p>
            ) : (
              <div className="divide-y divide-border">
                {session.movements.map((mov) => (
                  <div
                    key={mov.id}
                    className="flex items-center justify-between py-2.5 text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`rounded-md px-2 py-0.5 font-bold text-[10px] ${
                          mov.type === "BASE_INICIAL"
                            ? "bg-surface-dark-alt text-text-inverse"
                            : mov.type === "INGRESO"
                            ? "bg-emerald-500/15 text-emerald-800"
                            : "bg-rose-500/15 text-rose-800"
                        }`}
                      >
                        {mov.type}
                      </span>
                      <div>
                        <span className="font-semibold text-text-primary">
                          {mov.reason}
                        </span>
                        <div className="text-[11px] text-text-muted">
                          {new Date(mov.createdAt).toLocaleTimeString("es-CO")} • Por: {mov.cashier}
                        </div>
                      </div>
                    </div>

                    <span
                      className={`font-black font-mono ${
                        mov.type === "EGRESO" ? "text-rose-600" : "text-emerald-700"
                      }`}
                    >
                      {mov.type === "EGRESO" ? "–" : "+"}
                      {formatMoneyFull(mov.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal para Ingreso / Egreso */}
      {isMovementModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={movementType === "INGRESO" ? "Ingreso de Dinero" : "Egreso / Retiro"}
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsMovementModalOpen(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-md rounded-3xl border border-border bg-surface p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-text-primary">
                Registrar {movementType === "INGRESO" ? "Ingreso de Dinero" : "Egreso / Retiro"}
              </h3>
              <button
                type="button"
                onClick={() => setIsMovementModalOpen(false)}
                className="text-text-muted hover:text-text-primary text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label htmlFor="movAmountInput" className="block text-xs font-bold text-text-secondary uppercase mb-1">
                  Monto (COP)
                </label>
                <input
                  id="movAmountInput"
                  type="number"
                  step="1000"
                  value={movementAmount || ""}
                  onChange={(e) => setMovementAmount(parseInt(e.target.value, 10) || 0)}
                  placeholder="20000"
                  className="w-full rounded-xl border border-border bg-surface-alt px-3 py-2 text-base font-black text-text-primary focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="movReasonInput" className="block text-xs font-bold text-text-secondary uppercase mb-1">
                  Concepto / Motivo
                </label>
                <input
                  id="movReasonInput"
                  type="text"
                  value={movementReason}
                  onChange={(e) => setMovementReason(e.target.value)}
                  placeholder="Ej. Cambio de billetes / Pago mensajería"
                  className="w-full rounded-xl border border-border bg-surface-alt px-3 py-2 text-xs font-medium text-text-primary focus:border-primary focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsMovementModalOpen(false)}
                className="rounded-xl border border-border px-4 py-2 text-xs font-bold text-text-secondary hover:bg-surface-alt"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={movementAmount <= 0 || !movementReason.trim()}
                onClick={handleAddMovement}
                className="rounded-xl bg-primary px-5 py-2 text-xs font-black text-primary-fg shadow-sm hover:bg-primary-dark"
              >
                Guardar Movimiento
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Reporte de Cierre de Caja Realizado */}
      {isClosedSummaryVisible && lastClosedSession && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Resumen de cierre de turno de caja"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsClosedSummaryVisible(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-lg rounded-3xl border border-border bg-surface p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-600">
                ✓
              </div>
              <div>
                <h3 className="text-base font-black text-text-primary">
                  Turno de Caja Cerrado Satisfactoriamente
                </h3>
                <p className="text-xs text-text-muted">
                  Resumen de arqueo final registrado
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-surface-alt p-4 space-y-2 text-xs">
              <div className="flex justify-between">
                <span>Base Inicial:</span>
                <span className="font-bold">{formatMoneyFull(lastClosedSession.initialCash)}</span>
              </div>
              <div className="flex justify-between">
                <span>Ventas en Efectivo:</span>
                <span className="font-bold">{formatMoneyFull(lastClosedSession.salesSummary.totalCashSales)}</span>
              </div>
              <div className="flex justify-between">
                <span>Saldo Esperado:</span>
                <span className="font-bold">{formatMoneyFull(lastClosedSession.expectedCash)}</span>
              </div>
              <div className="flex justify-between">
                <span>Efectivo Físico Contado:</span>
                <span className="font-bold">{formatMoneyFull(lastClosedSession.countedCash)}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-1 font-black">
                <span>Diferencia:</span>
                <span className={lastClosedSession.difference === 0 ? "text-emerald-700" : "text-rose-700"}>
                  {formatMoneyFull(lastClosedSession.difference)}
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsClosedSummaryVisible(false)}
                className="rounded-xl bg-primary px-5 py-2.5 text-xs font-black text-primary-fg"
              >
                Aceptar y Finalizar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
