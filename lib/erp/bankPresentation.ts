import type { BankVentana } from "./bank";

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})/;

function parseDateOnly(value: string): Date | null {
  const match = DATE_ONLY.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

/** Día y mes en español: `22 de octubre`. */
export function formatSpanishDayMonth(value: Date | string): string {
  const date = typeof value === "string" ? parseDateOnly(value) : value;
  if (!date) return "";
  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "long",
  }).format(date);
}

/** Fecha larga en español: `21 de octubre de 2026`. */
export function formatSpanishLongDate(value: string): string {
  const date = parseDateOnly(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

/** Ventana de consulta legible: `22 de octubre` o `21 de octubre al 22 de octubre`. */
export function formatBankWindow(ventana?: BankVentana | null): string {
  if (!ventana?.desde) return "";
  const desde = formatSpanishDayMonth(ventana.desde);
  if (!desde) return "";
  if (!ventana.hasta || ventana.hasta === ventana.desde) return desde;
  const hasta = formatSpanishDayMonth(ventana.hasta);
  return hasta ? `${desde} al ${hasta}` : desde;
}

/** Nota del pie de la tarjeta de confirmación. */
export function reviewedMovementsNote(
  movimientos?: number | null,
  ventana?: BankVentana | null,
): string | null {
  if (typeof movimientos !== "number") return null;
  const window = formatBankWindow(ventana);
  if (!window) return `${movimientos} movimientos revisados`;
  return `${movimientos} movimientos revisados del ${window}`;
}
