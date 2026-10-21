/**
 * Cálculos puros para POS, fórmulas fiscales sgHermes y arqueo de caja.
 *
 * Paridad matemática con sgHermes:
 *   totdet = (valuni - dctpes + ivapes + ipopes) * candet
 *   dctpes = valuni * (discountPct / 100)
 *   ivapes = (valuni - dctpes) * (vatPct / 100)
 *   ipopes = (valuni - dctpes) * (ipoPct / 100)
 */

import type {
  CartItem,
  CartTotals,
  CashMovement,
  ColombianDenomination,
} from "./types";

export interface LineCalculationResult {
  valuni: number;
  candet: number;
  discountPct: number;
  dctpes: number;
  vatPct: number;
  ivapes: number;
  ipoPct: number;
  ipopes: number;
  totdet: number;
}

/**
 * Calcula los importes de una línea según la fórmula sgHermes.
 * Aplica redondeo entero para pesos colombianos (COP).
 */
export function calculateLineValues(
  valuni: number,
  candet: number,
  discountPct = 0,
  vatPct = 0,
  ipoPct = 0,
): LineCalculationResult {
  const safeValuni = Math.max(0, Number(valuni) || 0);
  const safeCandet = Math.max(0, Number(candet) || 0);
  const safeDiscountPct = Math.max(0, Math.min(100, Number(discountPct) || 0));
  const safeVatPct = Math.max(0, Number(vatPct) || 0);
  const safeIpoPct = Math.max(0, Number(ipoPct) || 0);

  // Descuento en pesos por unidad: valuni * (discountPct / 100)
  const dctpes = Math.round(safeValuni * (safeDiscountPct / 100));

  // Base gravable después de descuento
  const baseGravable = Math.max(0, safeValuni - dctpes);

  // Impuestos en pesos por unidad
  const ivapes = Math.round(baseGravable * (safeVatPct / 100));
  const ipopes = Math.round(baseGravable * (safeIpoPct / 100));

  // Total de la línea: (valuni - dctpes + ivapes + ipopes) * candet
  const totdet = Math.round((safeValuni - dctpes + ivapes + ipopes) * safeCandet);

  return {
    valuni: safeValuni,
    candet: safeCandet,
    discountPct: safeDiscountPct,
    dctpes,
    vatPct: safeVatPct,
    ivapes,
    ipoPct: safeIpoPct,
    ipopes,
    totdet,
  };
}

/**
 * Calcula los totales consolidados de la venta (cabecera facventas).
 *
 * subfven = Σ (valuni * candet)
 * totdct  = Σ (dctpes * candet)
 * totiva  = Σ (ivapes * candet)
 * totipo  = Σ (ipopes * candet)
 * total   = subfven - totdct + totiva + totipo = Σ totdet
 */
export function calculateCartTotals(items: readonly CartItem[]): CartTotals {
  let subtotal = 0;
  let totalDiscount = 0;
  let totalVat = 0;
  let totalIpo = 0;
  let total = 0;
  let itemCount = 0;

  for (const item of items) {
    const qty = Math.max(0, Number(item.candet) || 0);
    const valuni = Math.max(0, Number(item.valuni) || 0);
    const dctpes = Math.max(0, Number(item.dctpes) || 0);
    const ivapes = Math.max(0, Number(item.ivapes) || 0);
    const ipopes = Math.max(0, Number(item.ipopes) || 0);
    const totdet = Math.max(0, Number(item.totdet) || 0);

    subtotal += valuni * qty;
    totalDiscount += dctpes * qty;
    totalVat += ivapes * qty;
    totalIpo += ipopes * qty;
    total += totdet;
    itemCount += qty;
  }

  const netSubtotal = Math.max(0, subtotal - totalDiscount);

  return {
    subtotal: Math.round(subtotal),
    totalDiscount: Math.round(totalDiscount),
    netSubtotal: Math.round(netSubtotal),
    totalVat: Math.round(totalVat),
    totalIpo: Math.round(totalIpo),
    total: Math.round(total),
    itemCount,
    lineCount: items.length,
  };
}

/**
 * Calcula la suma total en efectivo del conteo de denominaciones para el arqueo.
 */
export function calculateArqueoTotal(
  counts: Partial<Record<ColombianDenomination | number, number>>,
): number {
  if (!counts || typeof counts !== "object") return 0;

  let total = 0;
  for (const [denominationStr, count] of Object.entries(counts)) {
    const denom = Number(denominationStr);
    const safeCount = Math.max(0, Math.floor(Number(count) || 0));
    if (!Number.isNaN(denom) && denom > 0 && safeCount > 0) {
      total += denom * safeCount;
    }
  }

  return Math.round(total);
}

/**
 * Calcula el cambio / vuelta a entregar al cliente.
 */
export function calculateChange(total: number, cashReceived: number): number {
  const safeTotal = Math.max(0, Number(total) || 0);
  const safeCashReceived = Math.max(0, Number(cashReceived) || 0);
  return Math.max(0, Math.round(safeCashReceived - safeTotal));
}

/**
 * Calcula el saldo esperado en caja según movimientos y ventas en efectivo.
 * expectedCash = initialCash + cashSales + totalIngresos - totalEgresos
 */
export function calculateCashBalance(
  initialCash: number,
  movements: readonly CashMovement[],
  cashSales: number,
): {
  totalIngresos: number;
  totalEgresos: number;
  expectedCash: number;
} {
  const safeInitial = Math.max(0, Number(initialCash) || 0);
  const safeCashSales = Math.max(0, Number(cashSales) || 0);

  let totalIngresos = 0;
  let totalEgresos = 0;

  for (const mov of movements) {
    const amount = Math.max(0, Number(mov.amount) || 0);
    if (mov.type === "INGRESO") {
      totalIngresos += amount;
    } else if (mov.type === "EGRESO") {
      totalEgresos += amount;
    }
  }

  const expectedCash = safeInitial + safeCashSales + totalIngresos - totalEgresos;

  return {
    totalIngresos: Math.round(totalIngresos),
    totalEgresos: Math.round(totalEgresos),
    expectedCash: Math.round(expectedCash),
  };
}

/**
 * Calcula la diferencia en arqueo:
 * diferencia = countedCash - expectedCash
 * > 0: Sobrante
 * = 0: Cuadre exacto
 * < 0: Faltante
 */
export function calculateDifference(
  countedCash: number,
  expectedCash: number,
): {
  difference: number;
  status: "EXACT" | "SURPLUS" | "SHORTAGE";
} {
  const diff = Math.round((Number(countedCash) || 0) - (Number(expectedCash) || 0));
  if (diff === 0) return { difference: 0, status: "EXACT" };
  if (diff > 0) return { difference: diff, status: "SURPLUS" };
  return { difference: diff, status: "SHORTAGE" };
}
