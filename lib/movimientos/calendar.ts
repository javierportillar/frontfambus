export type CalendarMode = "sales" | "purchases";

interface CalendarCopy {
  amountPhrase: string;
  countSingular: string;
  countPlural: string;
  countShort: string;
  averageLabel: string;
  zeroBadge: string;
  zeroLegend: string;
}

const COPY: Record<CalendarMode, CalendarCopy> = {
  sales: {
    amountPhrase: "en ventas netas",
    countSingular: "factura",
    countPlural: "facturas",
    countShort: "fac",
    averageLabel: "ticket",
    zeroBadge: "Neto $0",
    zeroLegend: "Facturas con venta neta $0",
  },
  purchases: {
    amountPhrase: "en compras",
    countSingular: "documento",
    countPlural: "documentos",
    countShort: "docs",
    averageLabel: "promedio",
    zeroBadge: "Total $0",
    zeroLegend: "Documentos con total $0",
  },
};

export function calendarCopy(mode: CalendarMode): CalendarCopy {
  return COPY[mode];
}

function countLabel(copy: CalendarCopy, count: number): string {
  return count === 1 ? copy.countSingular : copy.countPlural;
}

export function calendarDayAriaLabel(
  mode: CalendarMode,
  day: number,
  month: string,
  formattedAmount: string,
  count: number,
): string {
  const copy = calendarCopy(mode);
  return `${day} de ${month}: ${formattedAmount} ${copy.amountPhrase}, ${count} ${countLabel(copy, count)}`;
}

export function calendarMetricTitle(
  mode: CalendarMode,
  formattedAmount: string,
  count: number,
  formattedAverage: string,
): string {
  const copy = calendarCopy(mode);
  return `${formattedAmount} · ${count} ${countLabel(copy, count)} · ${copy.averageLabel} ${formattedAverage}`;
}
