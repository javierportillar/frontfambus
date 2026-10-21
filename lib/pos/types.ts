/**
 * Tipos y modelos para el Punto de Venta (POS) y Gestión de Caja.
 * Compatible con la lógica de reverse-engineering de sgHermes y perfil tributario Colombia.
 */

export interface POSProduct {
  sku: string;
  name: string;
  barcode?: string | null;
  price: number; // valuni (valor unitario base antes de impuestos y descuentos)
  cost?: number; // cosprod (costo al momento de la venta)
  vatPct?: number; // ivapor: 0, 5, 19 (%)
  ipoPct?: number; // ipopor: Impuesto Nacional al Consumo % (ej. 8 o 0)
  stock?: number | null;
  category?: string;
  unit?: string; // codmed (ej: 'UNIDAD', 'FRASCO', 'CAJA', 'PAR')
  brand?: string | null;
  image?: string | null;
}

export interface Customer {
  id: string;
  name: string;
  nit: string; // Documento / Cédula / NIT
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
}

export type DocumentType =
  | "FACTURA_VENTA"
  | "POS_TICKET"
  | "REMISION"
  | "COTIZACION";

/**
 * Línea de detalle del carrito según la fórmula matemática sgHermes:
 * totdet = (valuni - dctpes + ivapes + ipopes) * candet
 * donde:
 *   dctpes = valuni * (discountPct / 100)
 *   ivapes = (valuni - dctpes) * (vatPct / 100)
 *   ipopes = (valuni - dctpes) * (ipoPct / 100)
 */
export interface CartItem {
  id: string; // ID único de la línea (generalmente el SKU)
  product: POSProduct;
  candet: number; // Cantidad vendida
  valuni: number; // Valor unitario
  discountPct: number; // Porcentaje de descuento (0 a 100)
  dctpes: number; // Descuento en pesos por unidad
  vatPct: number; // Porcentaje de IVA (0, 5, 19, etc.)
  ivapes: number; // IVA en pesos por unidad
  ipoPct: number; // Porcentaje de impoconsumo (0, 8, etc.)
  ipopes: number; // Impoconsumo en pesos por unidad
  totdet: number; // Total de la línea = (valuni - dctpes + ivapes + ipopes) * candet
  notes?: string;
}

/** Totales consolidados de la cabecera */
export interface CartTotals {
  subtotal: number; // Σ (valuni * candet)
  totalDiscount: number; // Σ (dctpes * candet)
  netSubtotal: number; // subtotal - totalDiscount
  totalVat: number; // Σ (ivapes * candet)
  totalIpo: number; // Σ (ipopes * candet)
  total: number; // Σ totdet = netSubtotal + totalVat + totalIpo
  itemCount: number; // Σ candet
  lineCount: number; // items.length
}

export type PaymentMethod =
  | "EFECTIVO"
  | "DATAFONO"
  | "TRANSFERENCIA"
  | "CREDITO";

export interface PaymentEntry {
  id: string;
  method: PaymentMethod;
  amount: number;
  reference?: string;
  bank?: string;
}

export type CashMovementType = "BASE_INICIAL" | "INGRESO" | "EGRESO";

export interface CashMovement {
  id: string;
  sessionId: string;
  type: CashMovementType;
  amount: number;
  reason: string;
  createdAt: string;
  cashier: string;
}

/** Denominaciones oficiales del Banco de la República de Colombia */
export type ColombianDenomination =
  | 100000
  | 50000
  | 20000
  | 10000
  | 5000
  | 2000
  | 1000
  | 500
  | 200
  | 100
  | 50;

export type DenominationCount = Record<ColombianDenomination, number>;

export interface DenominationItem {
  value: ColombianDenomination;
  type: "bill" | "coin";
  label: string;
}

export interface CashSessionSummary {
  totalCashSales: number;
  totalElectronicSales: number;
  totalCreditSales: number;
  totalSales: number;
  salesCount: number;
  totalIngresos: number;
  totalEgresos: number;
}

export interface CashSession {
  id: string;
  tenant: string;
  cashier: string;
  registerName: string;
  status: "OPEN" | "CLOSED";
  openedAt: string;
  closedAt?: string;
  initialCash: number;
  movements: CashMovement[];
  salesSummary: CashSessionSummary;
  closingCount?: Partial<DenominationCount>;
  expectedCash?: number;
  countedCash?: number;
  difference?: number;
  closingNotes?: string;
}

export interface SalePayload {
  id: string; // Idempotency key / UUID
  documentType: DocumentType;
  documentNumber: string;
  customer: Customer;
  items: CartItem[];
  totals: CartTotals;
  payments: PaymentEntry[];
  cashReceived: number;
  changeGiven: number;
  sessionId?: string;
  cashier: string;
  tenant: string;
  createdAt: string;
  status: "COMPLETED" | "PENDING_SYNC" | "CANCELLED";
  offline?: boolean;
  syncError?: string;
  cufe?: string | null;
  qrUrl?: string | null;
}

/** Consumidor final estándar DIAN Colombia */
export const DEFAULT_CUSTOMER: Customer = {
  id: "CF-222222222222",
  name: "Consumidor Final",
  nit: "222222222222",
  phone: "",
  email: "",
  address: "Cali, Valle del Cauca",
  city: "Cali",
};

export const COLOMBIAN_DENOMINATIONS: readonly DenominationItem[] = [
  { value: 100000, type: "bill", label: "$100.000 (Billete Carlos Lleras)" },
  { value: 50000, type: "bill", label: "$50000 (Billete Gabriel García Márquez)" },
  { value: 20000, type: "bill", label: "$20.000 (Billete Alfonso López)" },
  { value: 10000, type: "bill", label: "$10.000 (Billete Virginia Gutiérrez)" },
  { value: 5000, type: "bill", label: "$5.000 (Billete José Asunción Silva)" },
  { value: 2000, type: "bill", label: "$2.000 (Billete Débora Arango)" },
  { value: 1000, type: "coin", label: "$1.000 (Moneda Tortuga Caguama)" },
  { value: 500, type: "coin", label: "$500 (Moneda Rana de Cristal)" },
  { value: 200, type: "coin", label: "$200 (Moneda Guacamaya Bandera)" },
  { value: 100, type: "coin", label: "$100 (Moneda Frailejón)" },
  { value: 50, type: "coin", label: "$50 (Moneda Oso de Anteojos)" },
] as const;
