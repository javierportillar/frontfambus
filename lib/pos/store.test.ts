import { beforeEach, describe, expect, it } from "vitest";
import { usePOSStore } from "./store";
import type { POSProduct } from "./types";

const mockProduct1: POSProduct = {
  sku: "MOT-001",
  name: "Aceite Castrol Actevo 20W-50 4T",
  price: 28000,
  vatPct: 19,
  category: "Aceites y Lubricantes",
  stock: 15,
};

const mockProduct2: POSProduct = {
  sku: "MOT-002",
  name: "Pastillas de Freno Delanteras Pulsar 200NS",
  price: 35000,
  vatPct: 0,
  category: "Frenos",
  stock: 8,
};

describe("lib/pos/store - POS Zustand Store", () => {
  beforeEach(() => {
    usePOSStore.getState().clearCart();
    usePOSStore.getState().resetCustomer();
    usePOSStore.getState().setDocumentType("FACTURA_VENTA");
    usePOSStore.getState().setSession(null);
  });

  it("adds a new product to empty cart and calculates line values", () => {
    const store = usePOSStore.getState();
    store.addItem(mockProduct1, 1);

    const cart = usePOSStore.getState().cart;
    expect(cart.length).toBe(1);
    expect(cart[0]!.product.sku).toBe("MOT-001");
    expect(cart[0]!.candet).toBe(1);
    expect(cart[0]!.valuni).toBe(28000);
    expect(cart[0]!.vatPct).toBe(19);
    // vat = 28000 * 0.19 = 5320
    expect(cart[0]!.ivapes).toBe(5320);
    expect(cart[0]!.totdet).toBe(33320);
  });

  it("increments quantity if same product is added multiple times", () => {
    const store = usePOSStore.getState();
    store.addItem(mockProduct1, 1);
    store.addItem(mockProduct1, 2);

    const cart = usePOSStore.getState().cart;
    expect(cart.length).toBe(1);
    expect(cart[0]!.candet).toBe(3);
    expect(cart[0]!.totdet).toBe(33320 * 3);
  });

  it("updates item quantity and removes item when quantity is set to 0", () => {
    const store = usePOSStore.getState();
    store.addItem(mockProduct1, 2);
    store.updateQuantity("MOT-001", 5);

    expect(usePOSStore.getState().cart[0]!.candet).toBe(5);

    store.updateQuantity("MOT-001", 0);
    expect(usePOSStore.getState().cart.length).toBe(0);
  });

  it("updates discount and recalculates line values and totals", () => {
    const store = usePOSStore.getState();
    store.addItem(mockProduct2, 2); // 35.000 x 2 = 70.000

    store.updateDiscount("MOT-002", 10); // 10% discount -> 3.500 per unit
    const item = usePOSStore.getState().cart[0]!;
    expect(item.discountPct).toBe(10);
    expect(item.dctpes).toBe(3500);
    expect(item.totdet).toBe((35000 - 3500) * 2); // 63.000

    const totals = usePOSStore.getState().getTotals();
    expect(totals.subtotal).toBe(70000);
    expect(totals.totalDiscount).toBe(7000);
    expect(totals.total).toBe(63000);
  });

  it("removes specific item from cart", () => {
    const store = usePOSStore.getState();
    store.addItem(mockProduct1, 1);
    store.addItem(mockProduct2, 1);
    expect(usePOSStore.getState().cart.length).toBe(2);

    store.removeItem("MOT-001");
    const cart = usePOSStore.getState().cart;
    expect(cart.length).toBe(1);
    expect(cart[0]!.product.sku).toBe("MOT-002");
  });

  it("manages payments, cash received and change correctly", () => {
    const store = usePOSStore.getState();
    store.addItem(mockProduct2, 1); // 35.000 total

    store.openPaymentModal();
    expect(usePOSStore.getState().isPaymentModalOpen).toBe(true);
    expect(usePOSStore.getState().cashReceived).toBe(35000);

    store.setCashReceived(50000);
    expect(usePOSStore.getState().cashReceived).toBe(50000);

    store.addPayment("DATAFONO", 15000, "AUTH-1234");
    expect(usePOSStore.getState().payments.length).toBe(1);
    expect(usePOSStore.getState().payments[0]!.method).toBe("DATAFONO");
    expect(usePOSStore.getState().payments[0]!.amount).toBe(15000);

    store.clearPayments();
    expect(usePOSStore.getState().payments.length).toBe(0);
    expect(usePOSStore.getState().cashReceived).toBe(0);
  });

  it("manages cash session movements and sales summary", () => {
    const store = usePOSStore.getState();
    store.setSession({
      id: "session-1",
      tenant: "motoshop",
      cashier: "Cajero Principal",
      registerName: "Caja 1",
      status: "OPEN",
      openedAt: new Date().toISOString(),
      initialCash: 100000,
      movements: [],
      salesSummary: {
        totalCashSales: 0,
        totalElectronicSales: 0,
        totalCreditSales: 0,
        totalSales: 0,
        salesCount: 0,
        totalIngresos: 0,
        totalEgresos: 0,
      },
      expectedCash: 100000,
    });

    store.addMovementToSession({
      id: "m-1",
      sessionId: "session-1",
      type: "INGRESO",
      amount: 50000,
      reason: "Base adicional",
      createdAt: new Date().toISOString(),
      cashier: "Cajero",
    });

    expect(usePOSStore.getState().session?.expectedCash).toBe(150000);

    store.recordSaleInSession(30000, true);
    expect(usePOSStore.getState().session?.salesSummary.salesCount).toBe(1);
    expect(usePOSStore.getState().session?.salesSummary.totalCashSales).toBe(30000);
    expect(usePOSStore.getState().session?.expectedCash).toBe(180000);
  });

  it("opens and closes receipt resetting isReceiptOpen and lastSale", () => {
    const store = usePOSStore.getState();
    store.setLastSale({
      id: "sale-1",
      documentType: "POS_TICKET",
      documentNumber: "POS-001",
      customer: { id: "1", name: "Juan", nit: "123" },
      items: [],
      totals: {
        subtotal: 10000,
        totalDiscount: 0,
        netSubtotal: 10000,
        totalVat: 0,
        totalIpo: 0,
        total: 10000,
        itemCount: 1,
        lineCount: 1,
      },
      payments: [],
      cashReceived: 10000,
      changeGiven: 0,
      cashier: "Cajero",
      tenant: "motoshop",
      createdAt: new Date().toISOString(),
      status: "COMPLETED",
    });
    store.openReceipt();
    expect(usePOSStore.getState().isReceiptOpen).toBe(true);
    expect(usePOSStore.getState().lastSale).not.toBeNull();

    store.closeReceipt();
    expect(usePOSStore.getState().isReceiptOpen).toBe(false);
    expect(usePOSStore.getState().lastSale).toBeNull();
  });

  it("isolates carts and state per tenant when switching tenants", () => {
    const store = usePOSStore.getState();

    // 1. Estar en masvital y agregar Almendras
    store.setTenant("masvital");
    store.addItem({
      sku: "OLAM001",
      name: "Almendra Americana",
      price: 70,
      vatPct: 0,
      category: "Frutos Secos",
      stock: 500,
      unit: "GRAMO",
    }, 250);

    expect(usePOSStore.getState().cart.length).toBe(1);
    expect(usePOSStore.getState().cart[0]!.product.sku).toBe("OLAM001");

    // 2. Cambiar a motoshop: el carrito de motoshop debe estar vacío
    store.setTenant("motoshop");
    expect(usePOSStore.getState().cart.length).toBe(0);

    // 3. Agregar repuesto en motoshop
    store.addItem(mockProduct1, 1);
    expect(usePOSStore.getState().cart.length).toBe(1);
    expect(usePOSStore.getState().cart[0]!.product.sku).toBe("MOT-001");

    // 4. Volver a masvital: el carrito con almendras debe seguir intacto
    store.setTenant("masvital");
    expect(usePOSStore.getState().cart.length).toBe(1);
    expect(usePOSStore.getState().cart[0]!.product.sku).toBe("OLAM001");
    expect(usePOSStore.getState().cart[0]!.candet).toBe(250);

    // 5. Volver a motoshop: el repuesto debe seguir intacto
    store.setTenant("motoshop");
    expect(usePOSStore.getState().cart.length).toBe(1);
    expect(usePOSStore.getState().cart[0]!.product.sku).toBe("MOT-001");
  });
});
