import type { ProductMovimiento } from "@/lib/api/hooks";

export interface FifoLotAllocation {
  index: number;
  vendidas: number;
  enStock: number;
  primeraVenta: string | null;
  ultimaVenta: string | null;
}

export interface FifoReconciliation {
  lots: FifoLotAllocation[];
  stockActual: number;
  movementBalance: number;
  discrepancy: number;
  unmatchedSales: number;
  reconciled: boolean;
}

function compareMovementOrder(a: ProductMovimiento, b: ProductMovimiento): number {
  return a.fecha.localeCompare(b.fecha)
    || String(a.cod_clase ?? "").localeCompare(String(b.cod_clase ?? ""), "es", { numeric: true })
    || String(a.num_documento).localeCompare(String(b.num_documento), "es", { numeric: true });
}

export function daysBetween(start: string, end: string): number | null {
  const startMs = new Date(`${start}T00:00:00`).getTime();
  const endMs = new Date(`${end}T00:00:00`).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  return Math.max(0, Math.round((endMs - startMs) / 86_400_000));
}

/** Estimate FIFO allocations and report, but never conceal, snapshot discrepancies. */
export function calculateFifoFromMovements(
  purchases: ProductMovimiento[],
  sales: ProductMovimiento[],
  stockActual: number,
): FifoReconciliation {
  const purchasesAscending = purchases
    .map((movement, index) => ({ movement, index }))
    .sort((a, b) => compareMovementOrder(a.movement, b.movement));
  const salesAscending = [...sales].sort(compareMovementOrder);
  const lots = purchasesAscending.map(({ movement, index }) => ({
    index,
    vendidas: 0,
    enStock: Math.max(0, movement.cantidad),
    primeraVenta: null as string | null,
    ultimaVenta: null as string | null,
  }));
  let unmatchedSales = 0;

  for (const sale of salesAscending) {
    let quantityToAllocate = Math.max(0, sale.cantidad);
    for (let index = 0; index < purchasesAscending.length && quantityToAllocate > 0; index++) {
      const purchase = purchasesAscending[index];
      const lot = lots[index];
      if (!purchase || !lot || lot.enStock <= 0) continue;
      if (purchase.movement.fecha > sale.fecha) break;
      const allocated = Math.min(lot.enStock, quantityToAllocate);
      lot.vendidas += allocated;
      lot.enStock -= allocated;
      lot.primeraVenta = lot.primeraVenta ?? sale.fecha;
      lot.ultimaVenta = sale.fecha;
      quantityToAllocate -= allocated;
    }
    unmatchedSales += quantityToAllocate;
  }

  const movementBalance = lots.reduce((total, lot) => total + lot.enStock, 0);
  const safeStock = Number.isFinite(stockActual) ? stockActual : 0;
  const discrepancy = safeStock - movementBalance;
  return {
    lots,
    stockActual: safeStock,
    movementBalance,
    discrepancy,
    unmatchedSales,
    reconciled: Math.abs(discrepancy) <= 0.001 && unmatchedSales <= 0.001,
  };
}
