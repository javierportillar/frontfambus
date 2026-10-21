import { create } from "zustand";
import { calculateCartTotals, calculateLineValues } from "./calculations";
import {
  DEFAULT_CUSTOMER,
  type CartItem,
  type CartTotals,
  type CashMovement,
  type CashSession,
  type Customer,
  type DocumentType,
  type PaymentEntry,
  type PaymentMethod,
  type POSProduct,
  type SalePayload,
} from "./types";

export interface POSState {
  // Carrito
  cart: CartItem[];
  customer: Customer;
  documentType: DocumentType;

  // Sesión de Caja Activa
  session: CashSession | null;

  // Estado del flujo de pago
  isPaymentModalOpen: boolean;
  payments: PaymentEntry[];
  cashReceived: number;

  // Modal de búsqueda de productos
  isSearchModalOpen: boolean;

  // Última venta realizada y modal de recibo
  lastSale: SalePayload | null;
  isReceiptOpen: boolean;

  // Notificación de escáner
  scannedNotification: { product: POSProduct; timestamp: number } | null;

  // Acciones de Carrito
  addItem: (_product: POSProduct, _quantity?: number) => void;
  removeItem: (_itemId: string) => void;
  updateQuantity: (_itemId: string, _quantity: number) => void;
  updateDiscount: (_itemId: string, _discountPct: number) => void;
  updateUnitPrice: (_itemId: string, _valuni: number) => void;
  clearCart: () => void;

  // Acciones de Cliente y Documento
  setCustomer: (_customer: Customer) => void;
  resetCustomer: () => void;
  setDocumentType: (_docType: DocumentType) => void;

  // Acciones de Sesión de Caja
  setSession: (_session: CashSession | null) => void;
  addMovementToSession: (_movement: CashMovement) => void;
  recordSaleInSession: (_total: number, _isCash: boolean) => void;

  // Acciones de Pagos
  openPaymentModal: () => void;
  closePaymentModal: () => void;
  setCashReceived: (_amount: number) => void;
  addPayment: (_method: PaymentMethod, _amount: number, _reference?: string) => void;
  removePayment: (_paymentId: string) => void;
  clearPayments: () => void;

  // Acciones de Búsqueda
  openSearchModal: () => void;
  closeSearchModal: () => void;

  // Recibo y Notificaciones
  setLastSale: (_sale: SalePayload | null) => void;
  openReceipt: () => void;
  closeReceipt: () => void;
  setScannedNotification: (_product: POSProduct | null) => void;

  // Helpers computados
  getTotals: () => CartTotals;
}

export const usePOSStore = create<POSState>((set, get) => ({
  cart: [],
  customer: DEFAULT_CUSTOMER,
  documentType: "FACTURA_VENTA",
  session: null,

  isPaymentModalOpen: false,
  payments: [],
  cashReceived: 0,

  isSearchModalOpen: false,
  lastSale: null,
  isReceiptOpen: false,
  scannedNotification: null,

  addItem: (product: POSProduct, quantity = 1) => {
    const safeQty = Math.max(1, quantity);
    const existing = get().cart.find((item) => item.product.sku === product.sku);

    if (existing) {
      const nextQty = existing.candet + safeQty;
      const lineVals = calculateLineValues(
        existing.valuni,
        nextQty,
        existing.discountPct,
        existing.vatPct,
        existing.ipoPct,
      );

      set((state) => ({
        cart: state.cart.map((item) =>
          item.product.sku === product.sku
            ? { ...item, ...lineVals }
            : item,
        ),
      }));
    } else {
      const vatPct = product.vatPct ?? 0;
      const ipoPct = product.ipoPct ?? 0;
      const lineVals = calculateLineValues(
        product.price,
        safeQty,
        0,
        vatPct,
        ipoPct,
      );

      const newItem: CartItem = {
        id: product.sku,
        product,
        ...lineVals,
      };

      set((state) => ({
        cart: [...state.cart, newItem],
      }));
    }
  },

  removeItem: (itemId: string) => {
    set((state) => ({
      cart: state.cart.filter((item) => item.id !== itemId),
    }));
  },

  updateQuantity: (itemId: string, quantity: number) => {
    if (quantity <= 0) {
      get().removeItem(itemId);
      return;
    }

    set((state) => ({
      cart: state.cart.map((item) => {
        if (item.id !== itemId) return item;
        const lineVals = calculateLineValues(
          item.valuni,
          quantity,
          item.discountPct,
          item.vatPct,
          item.ipoPct,
        );
        return { ...item, ...lineVals };
      }),
    }));
  },

  updateDiscount: (itemId: string, discountPct: number) => {
    set((state) => ({
      cart: state.cart.map((item) => {
        if (item.id !== itemId) return item;
        const lineVals = calculateLineValues(
          item.valuni,
          item.candet,
          discountPct,
          item.vatPct,
          item.ipoPct,
        );
        return { ...item, ...lineVals };
      }),
    }));
  },

  updateUnitPrice: (itemId: string, valuni: number) => {
    set((state) => ({
      cart: state.cart.map((item) => {
        if (item.id !== itemId) return item;
        const lineVals = calculateLineValues(
          valuni,
          item.candet,
          item.discountPct,
          item.vatPct,
          item.ipoPct,
        );
        return { ...item, ...lineVals };
      }),
    }));
  },

  clearCart: () => {
    set({
      cart: [],
      payments: [],
      cashReceived: 0,
      isPaymentModalOpen: false,
    });
  },

  setCustomer: (customer: Customer) => {
    set({ customer });
  },

  resetCustomer: () => {
    set({ customer: DEFAULT_CUSTOMER });
  },

  setDocumentType: (documentType: DocumentType) => {
    set({ documentType });
  },

  setSession: (session: CashSession | null) => {
    set({ session });
  },

  addMovementToSession: (movement: CashMovement) => {
    const current = get().session;
    if (!current) return;

    const nextMovements = [...current.movements, movement];
    const totalIngresos = nextMovements
      .filter((m) => m.type === "INGRESO")
      .reduce((sum, m) => sum + m.amount, 0);
    const totalEgresos = nextMovements
      .filter((m) => m.type === "EGRESO")
      .reduce((sum, m) => sum + m.amount, 0);

    const expectedCash =
      current.initialCash +
      current.salesSummary.totalCashSales +
      totalIngresos -
      totalEgresos;

    set({
      session: {
        ...current,
        movements: nextMovements,
        expectedCash,
        salesSummary: {
          ...current.salesSummary,
          totalIngresos,
          totalEgresos,
        },
      },
    });
  },

  recordSaleInSession: (total: number, isCash: boolean) => {
    const current = get().session;
    if (!current) return;

    const prevSummary = current.salesSummary;
    const nextSummary = {
      ...prevSummary,
      salesCount: prevSummary.salesCount + 1,
      totalSales: prevSummary.totalSales + total,
      totalCashSales: isCash
        ? prevSummary.totalCashSales + total
        : prevSummary.totalCashSales,
      totalElectronicSales: !isCash
        ? prevSummary.totalElectronicSales + total
        : prevSummary.totalElectronicSales,
    };

    const totalIngresos = current.movements
      .filter((m) => m.type === "INGRESO")
      .reduce((sum, m) => sum + m.amount, 0);
    const totalEgresos = current.movements
      .filter((m) => m.type === "EGRESO")
      .reduce((sum, m) => sum + m.amount, 0);

    const expectedCash =
      current.initialCash +
      nextSummary.totalCashSales +
      totalIngresos -
      totalEgresos;

    set({
      session: {
        ...current,
        salesSummary: nextSummary,
        expectedCash,
      },
    });
  },

  openPaymentModal: () => {
    const totals = get().getTotals();
    // Inicia efectivo recibido sugerido igual al total
    set({
      isPaymentModalOpen: true,
      cashReceived: totals.total,
    });
  },

  closePaymentModal: () => {
    set({ isPaymentModalOpen: false });
  },

  setCashReceived: (amount: number) => {
    set({ cashReceived: Math.max(0, amount) });
  },

  addPayment: (method: PaymentMethod, amount: number, reference?: string) => {
    const safeAmount = Math.max(0, amount);
    if (safeAmount <= 0) return;

    const newPayment: PaymentEntry = {
      id: `pay-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      method,
      amount: safeAmount,
      reference,
    };

    set((state) => ({
      payments: [...state.payments, newPayment],
    }));
  },

  removePayment: (paymentId: string) => {
    set((state) => ({
      payments: state.payments.filter((p) => p.id !== paymentId),
    }));
  },

  clearPayments: () => {
    set({ payments: [], cashReceived: 0 });
  },

  openSearchModal: () => {
    set({ isSearchModalOpen: true });
  },

  closeSearchModal: () => {
    set({ isSearchModalOpen: false });
  },

  setLastSale: (lastSale: SalePayload | null) => {
    set({ lastSale });
  },

  openReceipt: () => {
    set({ isReceiptOpen: true });
  },

  closeReceipt: () => {
    set({ isReceiptOpen: false, lastSale: null });
  },

  setScannedNotification: (product: POSProduct | null) => {
    if (!product) {
      set({ scannedNotification: null });
      return;
    }
    set({
      scannedNotification: {
        product,
        timestamp: Date.now(),
      },
    });
  },

  getTotals: () => {
    return calculateCartTotals(get().cart);
  },
}));
