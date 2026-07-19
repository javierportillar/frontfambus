"use client";

import { useMemo } from "react";
import { formatMoneyFull } from "@/lib/format/currency";
import { businessDateISO } from "@/lib/date/business";
import {
  calendarCopy,
  calendarDayAriaLabel,
  calendarMetricTitle,
  type CalendarMode,
} from "@/lib/movimientos/calendar";

export interface CalendarDayData {
  /** YYYY-MM-DD */
  date: string;
  day: number;
  sales: number;
  invoices: number;
  avgTicket: number;
}

interface CalendarProps {
  /** Define la terminología accesible y visual del movimiento. */
  mode: CalendarMode;
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
 * el total como número grande, y debajo cantidad de documentos + promedio.
 * La intensidad de un mini-bar al pie refleja qué tan fuerte fue el día
 * comparado con el mejor del mes (para identificar visualmente los picos).
 */
export function Calendar({ mode, month, days, onDayClick, selectedDate }: CalendarProps): JSX.Element {
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
      if (Math.abs(d.sales) > max) max = Math.abs(d.sales);
    });
    return max;
  }, [days]);

  const cells: Array<{ day: number; data?: CalendarDayData } | null> = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push({ day: d, data: byDay.get(d) });

  const todayIso = businessDateISO();
  const copy = calendarCopy(mode);

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
          const hasRecord = data !== undefined;
          const hasMovement = Boolean(data && (data.invoices > 0 || data.sales !== 0));
          // A net-zero day can still contain invoices/returns and must remain inspectable.
          const isSelectable = Boolean(data && data.invoices > 0) || Boolean(data && data.sales !== 0);
          const intensity = hasMovement && maxSales > 0 ? Math.abs(data?.sales ?? 0) / maxSales : 0;

          return (
            <button
              key={isoDate}
              type="button"
              onClick={() => isSelectable && onDayClick(isoDate)}
              disabled={!isSelectable}
              className={[
                "relative flex flex-col rounded-xl border p-2 text-left transition-[transform,border-color,box-shadow,background-color] motion-reduce:transition-none",
                "min-h-[90px]",
                isSelected
                  ? "border-primary-light bg-primary/10 ring-2 ring-primary/30"
                  : hasRecord
                    ? "border-border bg-surface"
                    : "border-dashed border-border/80 bg-surface-alt/30",
                isSelectable
                  ? "cursor-pointer hover:-translate-y-0.5 hover:border-primary hover:shadow-md motion-reduce:hover:translate-y-0"
                  : "cursor-default",
                isWeekend && !hasRecord && "bg-surface-alt/60",
              ].filter(Boolean).join(" ")}
              aria-label={
                hasRecord
                  ? calendarDayAriaLabel(
                      mode,
                      cell.day,
                      monthStr,
                      formatMoneyFull(data.sales),
                      data.invoices,
                    )
                  : `${cell.day} de ${monthStr}: datos diarios no disponibles`
              }
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
              {hasMovement && data ? (
                <div className="mt-auto">
                  <div
                    className="text-xs font-bold text-text-primary leading-tight tabular-nums"
                    title={calendarMetricTitle(
                      mode,
                      formatMoneyFull(data.sales),
                      data.invoices,
                      formatMoneyFull(data.avgTicket),
                    )}
                  >
                    {formatMoneyFull(data.sales)}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-text-muted">
                    <span>{data.invoices} {copy.countShort}</span>
                    <span>·</span>
                    <span className="tabular-nums">{formatMoneyFull(data.avgTicket)}</span>
                  </div>
                  {/* Mini-bar de intensidad */}
                  <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-surface-alt">
                    <div
                      className="h-full rounded-full bg-primary transition-[width] motion-reduce:transition-none"
                      style={{ width: `${Math.max(8, intensity * 100)}%` }}
                    />
                  </div>
                  {data.sales === 0 && data.invoices > 0 && (
                    <span className="mt-1 inline-flex rounded-full bg-warning/10 px-1.5 py-0.5 text-[9px] font-semibold text-warning">
                      {copy.zeroBadge}
                    </span>
                  )}
                </div>
              ) : hasRecord ? (
                <div className="mt-auto text-[10px] font-medium text-text-muted">Sin movimiento</div>
              ) : (
                <div className="mt-auto text-[10px] text-text-muted/80">No cargado</div>
              )}
            </button>
          );
        })}
      </div>

      {/* Leyenda */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-2 text-[11px] text-text-muted">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-primary" /> Con movimiento</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-warning" /> {copy.zeroLegend}</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full border border-dashed border-border-strong" /> No cargado</span>
        <span className="basis-full">Seleccioná un día con movimiento para ver su detalle.</span>
      </div>
    </div>
  );
}
