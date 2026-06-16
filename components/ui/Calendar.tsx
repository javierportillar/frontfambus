"use client";

import { useMemo } from "react";
import { formatMoney } from "@/lib/format/currency";

export interface CalendarDayData {
  /** YYYY-MM-DD */
  date: string;
  day: number;
  sales: number;
  invoices: number;
  avgTicket: number;
}

interface CalendarProps {
  /** YYYY-MM del mes a renderizar. */
  month: string;
  /** Datos por día (alineados con day del mes). Días ausentes se renderizan en blanco. */
  days: CalendarDayData[];
  /** Callback al click en un día. */
  onDayClick: (date: string) => void;
  /** YYYY-MM-DD del día seleccionado (opcional, se resalta). */
  selectedDate?: string;
}

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function daysInMonth(year: number, monthIdx0: number): number {
  return new Date(year, monthIdx0 + 1, 0).getDate();
}

/** weekday-monday-first: 0=Lun, 6=Dom */
function weekdayMonStart(year: number, monthIdx0: number, day: number): number {
  const js = new Date(year, monthIdx0, day).getDay(); // 0=Dom..6=Sáb
  return (js + 6) % 7;
}

/**
 * Calendario de un mes con celdas clickeables. Cada celda muestra el día,
 * las ventas como número grande, y debajo facturas + ticket promedio.
 * La intensidad de un mini-bar al pie refleja qué tan fuerte fue el día
 * comparado con el mejor del mes (para identificar visualmente los picos).
 */
export function Calendar({ month, days, onDayClick, selectedDate }: CalendarProps): JSX.Element {
  const [yearStr = "2026", monthStr = "01"] = month.split("-");
  const year = Number(yearStr);
  const monthIdx0 = Number(monthStr) - 1;
  const totalDays = daysInMonth(year, monthIdx0);
  const firstWeekday = weekdayMonStart(year, monthIdx0, 1);

  // Map fast lookup por día
  const byDay = useMemo(() => {
    const m = new Map<number, CalendarDayData>();
    days.forEach((d) => m.set(d.day, d));
    return m;
  }, [days]);

  const maxSales = useMemo(() => {
    let max = 0;
    days.forEach((d) => {
      if (d.sales > max) max = d.sales;
    });
    return max;
  }, [days]);

  const cells: Array<{ day: number; data?: CalendarDayData } | null> = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push({ day: d, data: byDay.get(d) });

  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-2">
      {/* Header dias de la semana */}
      <div className="grid grid-cols-7 gap-2 text-center text-xs font-semibold text-text-muted">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-1">
            {w}
          </div>
        ))}
      </div>
      {/* Celdas */}
      <div className="grid grid-cols-7 gap-2">
        {cells.map((cell, i) => {
          if (!cell) {
            return <div key={`empty-${i}`} className="aspect-square" />;
          }
          const isoDate = `${yearStr}-${monthStr}-${String(cell.day).padStart(2, "0")}`;
          const isToday = isoDate === todayIso;
          const isSelected = isoDate === selectedDate;
          const isWeekend = (i % 7) >= 5;
          const data = cell.data;
          const hasData = data && data.sales > 0;
          const intensity = hasData && maxSales > 0 ? data.sales / maxSales : 0;

          return (
            <button
              key={isoDate}
              type="button"
              onClick={() => hasData && onDayClick(isoDate)}
              disabled={!hasData}
              className={[
                "relative flex flex-col rounded-xl border p-2 text-left transition-all",
                "min-h-[90px]",
                isSelected
                  ? "border-primary-light bg-primary/5 ring-2 ring-primary/30"
                  : "border-border bg-white",
                hasData
                  ? "cursor-pointer hover:border-primary hover:shadow-md hover:-translate-y-0.5"
                  : "cursor-default opacity-50",
                isWeekend && !hasData && "bg-surface-alt",
              ].filter(Boolean).join(" ")}
              aria-label={`${cell.day} de ${monthStr}: ${formatMoney(data?.sales ?? 0)} en ventas`}
            >
              {/* Día número */}
              <div className="flex items-center justify-between">
                <span
                  className={[
                    "text-xs font-semibold",
                    isToday ? "text-primary" : isWeekend ? "text-text-muted" : "text-text-secondary",
                  ].join(" ")}
                >
                  {cell.day}
                </span>
                {isToday && (
                  <span className="text-[9px] font-bold uppercase tracking-wider text-primary">Hoy</span>
                )}
              </div>

              {/* Métricas */}
              {hasData ? (
                <div className="mt-auto">
                  <div className="text-sm font-bold text-text-primary leading-tight">
                    {formatMoney(data.sales)}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-text-muted">
                    <span>{data.invoices} fac</span>
                    <span>·</span>
                    <span>{formatMoney(data.avgTicket)}</span>
                  </div>
                  {/* Mini-bar de intensidad */}
                  <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-surface-alt">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${Math.max(8, intensity * 100)}%` }}
                    />
                  </div>
                </div>
              ) : (
                <div className="mt-auto text-[10px] text-text-muted">Sin ventas</div>
              )}
            </button>
          );
        })}
      </div>

      {/* Leyenda */}
      <div className="flex items-center gap-3 pt-2 text-[11px] text-text-muted">
        <span>Click en un día para ver el detalle completo.</span>
      </div>
    </div>
  );
}
