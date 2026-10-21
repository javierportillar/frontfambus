/**
 * Capa de API para POS y Gestión de Caja con tolerancia a fallos y resiliencia offline.
 * Utiliza idb-keyval para la cola offline cuando no hay conectividad.
 */

import { get, set } from "idb-keyval";
import { apiFetchJson } from "./client";
import { fetchWithFailover } from "./backendFailover";
import type {
  CashMovement,
  CashSession,
  POSProduct,
  SalePayload,
} from "@/lib/pos/types";

const OFFLINE_SALES_STORE = "pending-pos-sales";
const RECENT_SALES_STORE = "recent-pos-sales";
const ACTIVE_SESSION_STORE = "active-pos-session";

// Catálogo base de repuestos de moto (MotoShop) y abarrotes (MasVital)
export const MOTO_SHOP_SAMPLE_PRODUCTS: readonly POSProduct[] = [
  {
    sku: "CAS-ACT-20W50",
    name: "Aceite Castrol Actevo 20W-50 4T x 1L",
    barcode: "7701234567890",
    price: 28000,
    cost: 21000,
    vatPct: 19,
    ipoPct: 0,
    stock: 24,
    category: "Aceites y Lubricantes",
    unit: "FRASCO",
    brand: "Castrol",
  },
  {
    sku: "MOT-7100-10W40",
    name: "Aceite Motul 7100 10W-40 100% Sintético x 1L",
    barcode: "7702345678901",
    price: 68000,
    cost: 52000,
    vatPct: 19,
    ipoPct: 0,
    stock: 12,
    category: "Aceites y Lubricantes",
    unit: "FRASCO",
    brand: "Motul",
  },
  {
    sku: "PAS-DEL-200NS",
    name: "Pastillas de Freno Delanteras Pulsar 200 NS / Dominar",
    barcode: "7703456789012",
    price: 35000,
    cost: 24000,
    vatPct: 0,
    ipoPct: 0,
    stock: 18,
    category: "Frenos",
    unit: "JUEGO",
    brand: "Revo",
  },
  {
    sku: "ARR-CAS-P200",
    name: "Kit Arrastre Pulsar 200 NS Cassarella Paso 520 Reforzado",
    barcode: "7704567890123",
    price: 145000,
    cost: 110000,
    vatPct: 19,
    ipoPct: 0,
    stock: 6,
    category: "Transmisión",
    unit: "KIT",
    brand: "Cassarella",
  },
  {
    sku: "BUJ-NGK-CR9E",
    name: "Bujía NGK CR9E Cobre Convencional",
    barcode: "7705678901234",
    price: 18000,
    cost: 12000,
    vatPct: 19,
    ipoPct: 0,
    stock: 35,
    category: "Encendido",
    unit: "UNIDAD",
    brand: "NGK",
  },
  {
    sku: "LLA-MICH-10080",
    name: "Llanta Delantera Michelin Pilot Street 100/80-17 Sellomática",
    barcode: "7706789012345",
    price: 185000,
    cost: 148000,
    vatPct: 19,
    ipoPct: 0,
    stock: 4,
    category: "Llantas",
    unit: "UNIDAD",
    brand: "Michelin",
  },
  {
    sku: "FIL-KN-138",
    name: "Filtro de Aceite K&N KN-138 Alto Flujo Suzuki/Kawasaki",
    barcode: "7707890123456",
    price: 42000,
    cost: 31000,
    vatPct: 19,
    ipoPct: 0,
    stock: 9,
    category: "Filtros",
    unit: "UNIDAD",
    brand: "K&N",
  },
  {
    sku: "LIQ-MOT-DOT4",
    name: "Líquido de Frenos Motul DOT 4 500ml",
    barcode: "7708901234567",
    price: 26000,
    cost: 18500,
    vatPct: 19,
    ipoPct: 0,
    stock: 14,
    category: "Líquidos",
    unit: "FRASCO",
    brand: "Motul",
  },
  {
    sku: "CAD-DID-520VX3",
    name: "Cadena DID 520VX3 O-Ring Reforzada Gold 120L",
    barcode: "7709012345678",
    price: 230000,
    cost: 180000,
    vatPct: 19,
    ipoPct: 0,
    stock: 5,
    category: "Transmisión",
    unit: "UNIDAD",
    brand: "DID",
  },
  {
    sku: "CAS-SHAFT-582",
    name: "Casco Integral Shaft Pro Series 582 Matt Black Talla L",
    barcode: "7700123456789",
    price: 320000,
    cost: 250000,
    vatPct: 19,
    ipoPct: 0,
    stock: 3,
    category: "Accesorios y Seguridad",
    unit: "UNIDAD",
    brand: "Shaft",
  },
];

// In-memory fallback para Node.js / pruebas unitarias donde indexedDB no esté disponible
const memoryStores: Record<string, unknown> = {};

async function safeIdbGet<T>(key: string): Promise<T | null> {
  try {
    if (typeof window !== "undefined" && "indexedDB" in window) {
      return (await get<T>(key)) ?? null;
    }
  } catch {
    // Fallback a memoria
  }
  return (memoryStores[key] as T) ?? null;
}

async function safeIdbSet<T>(key: string, value: T): Promise<void> {
  try {
    if (typeof window !== "undefined" && "indexedDB" in window) {
      await set(key, value);
    }
  } catch {
    // Fallback a memoria
  }
  memoryStores[key] = value;
}

/**
 * Busca productos en el catálogo disponible.
 * Soporta búsqueda en vivo contra backend con failover automático al catálogo local.
 */
export async function searchPOSProducts(
  query: string,
  tenant?: string,
): Promise<POSProduct[]> {
  const clean = query.trim().toLowerCase();

  // Intentar backend si hay red
  if (typeof window !== "undefined" && navigator.onLine) {
    try {
      const remote = await apiFetchJson<POSProduct[]>(
        `/api/pos/products?q=${encodeURIComponent(clean)}`,
      );
      if (Array.isArray(remote) && remote.length > 0) {
        return remote;
      }
    } catch {
      // Continuar con fallback local si el endpoint no está disponible
    }
  }

  // Si el tenant es masvital, intentar cargar su catálogo
  if (tenant === "masvital") {
    try {
      const masvitalData = await import("@/data/catalog/masvital.json");
      if (masvitalData?.products) {
        const mvProducts: POSProduct[] = masvitalData.products.map((p) => ({
          sku: p.sku,
          name: p.name,
          barcode: p.barcode || p.sku,
          price: p.price ?? 0,
          vatPct: 0, // Varios productos de canasta/abarrotes son exentos
          ipoPct: 0,
          stock: p.stock ?? 10,
          category: p.category,
          unit: p.presentation || "UNIDAD",
          brand: p.brand,
          image: p.image,
        }));

        if (!clean) return mvProducts.slice(0, 30);

        return mvProducts.filter(
          (p) =>
            p.name.toLowerCase().includes(clean) ||
            p.sku.toLowerCase().includes(clean) ||
            (p.barcode && p.barcode.toLowerCase().includes(clean)),
        );
      }
    } catch {
      // Ignorar error y usar MOTO_SHOP_SAMPLE_PRODUCTS
    }
  }

  if (!clean) return [...MOTO_SHOP_SAMPLE_PRODUCTS];

  return MOTO_SHOP_SAMPLE_PRODUCTS.filter(
    (p) =>
      p.name.toLowerCase().includes(clean) ||
      p.sku.toLowerCase().includes(clean) ||
      (p.barcode && p.barcode.toLowerCase().includes(clean)) ||
      (p.category && p.category.toLowerCase().includes(clean)) ||
      (p.brand && p.brand.toLowerCase().includes(clean)),
  );
}

/**
 * Busca un producto por código de barras exacto o por SKU.
 */
export async function findPOSProductByBarcode(
  barcodeOrSku: string,
  tenant?: string,
): Promise<POSProduct | null> {
  const code = barcodeOrSku.trim();
  if (!code) return null;

  const products = await searchPOSProducts("", tenant);
  const matched = products.find(
    (p) =>
      (p.barcode && p.barcode.trim() === code) ||
      p.sku.trim().toLowerCase() === code.toLowerCase(),
  );

  return matched ?? null;
}

/**
 * Guarda o actualiza una venta en el POS.
 * Si no hay conexión, se encola en IndexedDB (idb-keyval) con status PENDING_SYNC.
 */
export async function submitSale(
  sale: SalePayload,
): Promise<{ success: boolean; offline: boolean; sale: SalePayload }> {
  // Asegurar numeración de recibo si no viene
  const documentNumber =
    sale.documentNumber ||
    `POS-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;

  const finalSale: SalePayload = {
    ...sale,
    documentNumber,
  };

  const isOnline = typeof window !== "undefined" ? navigator.onLine : false;

  if (isOnline) {
    try {
      const resp = await fetchWithFailover("/api/pos/sales", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Idempotency-Key": finalSale.id,
          "X-Tenant": finalSale.tenant,
        },
        body: JSON.stringify(finalSale),
      });

      if (resp.resp.ok) {
        finalSale.status = "COMPLETED";
        finalSale.offline = false;
        await saveRecentSale(finalSale);
        return { success: true, offline: false, sale: finalSale };
      }
    } catch {
      // Falla de red: encolar localmente
    }
  }

  // Modo offline: encolar venta para sincronización posterior
  finalSale.status = "PENDING_SYNC";
  finalSale.offline = true;

  await enqueueOfflineSale(finalSale);
  await saveRecentSale(finalSale);

  return { success: true, offline: true, sale: finalSale };
}

async function enqueueOfflineSale(sale: SalePayload): Promise<void> {
  const queue = (await safeIdbGet<SalePayload[]>(OFFLINE_SALES_STORE)) ?? [];
  const existingIdx = queue.findIndex((s) => s.id === sale.id);
  if (existingIdx >= 0) {
    queue[existingIdx] = sale;
  } else {
    queue.push(sale);
  }
  await safeIdbSet(OFFLINE_SALES_STORE, queue);
}

async function saveRecentSale(sale: SalePayload): Promise<void> {
  const recents = (await safeIdbGet<SalePayload[]>(RECENT_SALES_STORE)) ?? [];
  const filtered = recents.filter((s) => s.id !== sale.id);
  filtered.unshift(sale);
  await safeIdbSet(RECENT_SALES_STORE, filtered.slice(0, 50));
}

export async function getPendingSales(): Promise<SalePayload[]> {
  return (await safeIdbGet<SalePayload[]>(OFFLINE_SALES_STORE)) ?? [];
}

export async function getRecentSales(): Promise<SalePayload[]> {
  return (await safeIdbGet<SalePayload[]>(RECENT_SALES_STORE)) ?? [];
}

/**
 * Reintenta sincronizar ventas pendientes con el backend.
 */
export async function flushPendingSales(): Promise<{
  synced: number;
  failed: number;
}> {
  const queue = await getPendingSales();
  if (queue.length === 0) return { synced: 0, failed: 0 };

  const remaining: SalePayload[] = [];
  let synced = 0;
  let failed = 0;

  for (const sale of queue) {
    try {
      const resp = await fetchWithFailover("/api/pos/sales", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Idempotency-Key": sale.id,
          "X-Tenant": sale.tenant,
        },
        body: JSON.stringify(sale),
      });

      if (resp.resp.ok) {
        sale.status = "COMPLETED";
        sale.offline = false;
        synced++;
        await saveRecentSale(sale);
      } else {
        failed++;
        remaining.push(sale);
      }
    } catch (err) {
      failed++;
      sale.syncError = err instanceof Error ? err.message : String(err);
      remaining.push(sale);
    }
  }

  await safeIdbSet(OFFLINE_SALES_STORE, remaining);
  return { synced, failed };
}

/**
 * Obtiene o inicializa la sesión de caja activa desde almacenamiento local o backend.
 */
export async function getActiveCashSession(
  tenant: string,
): Promise<CashSession | null> {
  return await safeIdbGet<CashSession>(`${ACTIVE_SESSION_STORE}-${tenant}`);
}

/**
 * Guarda el estado actual de la sesión de caja en almacenamiento local.
 */
export async function saveCashSession(session: CashSession): Promise<void> {
  await safeIdbSet(`${ACTIVE_SESSION_STORE}-${session.tenant}`, session);
}

/**
 * Registra un movimiento de efectivo (Ingreso/Egreso).
 */
export async function recordCashMovement(
  sessionId: string,
  type: CashMovement["type"],
  amount: number,
  reason: string,
  cashier: string,
): Promise<CashMovement> {
  return {
    id: `mov-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    sessionId,
    type,
    amount,
    reason,
    cashier,
    createdAt: new Date().toISOString(),
  };
}
