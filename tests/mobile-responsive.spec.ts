import { test, expect, type Page } from "@playwright/test";

const enabledFeatures = ["chat-ia", "ventas-summary", "inventario", "alerts", "dormidos", "abc", "analisis", "forecast", "decisiones"];

const providerResponse = {
  fecha_inicio: "2026-09-01",
  fecha_fin: "2026-09-27",
  proveedores: [
    {
      nit: "1010119448",
      nombre: "DISTRIBUCIONES Y ALIMENTOS LA ESQUINA DEL NORTE S.A.S.",
      num_documentos: 10,
      total_compras: 6749419,
      primera_compra: "2026-09-02",
      ultima_compra: "2026-09-26",
    },
    {
      nit: "901201374",
      nombre: "PROVEEDORA DEL VALLE",
      num_documentos: 3,
      total_compras: 1400000,
      primera_compra: "2026-09-05",
      ultima_compra: "2026-09-20",
    },
    {
      nit: "900319753",
      nombre: "COMERCIALIZADORA SMART",
      num_documentos: 1,
      total_compras: 1100000,
      primera_compra: "2026-09-08",
      ultima_compra: "2026-09-08",
    },
    {
      nit: "1015448634",
      nombre: "ALIMENTOS Y BEBIDAS DEL PACÍFICO",
      num_documentos: 3,
      total_compras: 249000,
      primera_compra: "2026-09-10",
      ultima_compra: "2026-09-27",
    },
  ],
};

const supplierProfileResponse = {
  proveedor: { nit: "1010119448", nombre: "DISTRIBUCIONES DEL NORTE" },
  periodo: { fecha_inicio: "2025-09-27", fecha_fin: "2026-09-27" },
  compras: {
    total_compras: 8_200_000,
    num_documentos: 22,
    ticket_promedio: 372_727,
    primera_compra: "2025-10-02",
    ultima_compra: "2026-09-26",
    skus_distintos: 3,
    productos_top: [{
      cod_producto: "SKU123456789012345678901234567890ABCDEFGHIJ",
      nombre: "Kombucha artesanal de maracuyá presentación familiar",
      unidades: 120,
      total_compras: 2_400_000,
      documentos: 8,
    }],
  },
  ventas_estimadas: {
    revenue: 12_000_000,
    revenue_with_cost: 12_000_000,
    lineas_venta: 42,
    lineas_con_costo: 42,
    margen_cobertura_pct: 100,
    margen: 3_800_000,
    margen_pct: 31.7,
    skus_vendidos: 3,
    skus_con_costo: 3,
    metodo_atribucion: {
      id: "latest_supplier_per_sku",
      descripcion: "Atribución estimada por proveedor conocido más reciente.",
    },
  },
  documentos: [{
    business_date: "2026-09-10",
    cod_clase: "FC",
    num_documento: "194",
    total_factura: 3_000_000,
    num_items: 4,
  }],
  paginacion: { page: 1, page_size: 20, total_documentos: 1, has_more: false },
};

const supplierAnalysisResponse = {
  fecha_inicio: "2026-09-01",
  fecha_fin: "2026-09-27",
  total_proveedores: 1,
  total_compras: 6_749_419,
  total_ventas_de_proveedores: 12_000_000,
  total_margen_de_proveedores: 3_800_000,
  concentracion: { top1_pct: 100, top3_pct: 100, top5_pct: 100, hhi: 10000, riesgo: "crítico" },
  pareto: { prov_para_80_pct: 1, pct_prov: 100, total_prov: 1 },
  alertas: [],
  proveedores: [{
    nit: "1010119448",
    nombre: "DISTRIBUCIONES Y ALIMENTOS LA ESQUINA DEL NORTE S.A.S.",
    num_documentos: 10,
    total_compras: 6_749_419,
    pct_del_total: 100,
    primera_compra: "2026-09-02",
    ultima_compra: "2026-09-26",
    dias_desde_ultima_compra: 1,
    frecuencia_dias_promedio: 8,
    ticket_promedio: 674_941,
    revenue_periodo: 12_000_000,
    margen_periodo: 3_800_000,
    margen_pct: 31.7,
    skus_vendidos: 4,
    ratio_venta_compra: 1.78,
    pct_ventas_asociadas: 100,
  }],
};

const expiryLot = {
  id: "lot-1",
  tenant: "masvital" as const,
  product_sku: "SKU-KOMBUCHA-MARACUYA-1L",
  product_name: "Kombucha artesanal de maracuyá presentación familiar",
  purchase_order_ref: "FACTURA-194",
  lot_code: "LOTE-MARACUYA-2026-09-A",
  expires_on: "2026-12-15",
  received_on: "2026-09-10",
  received_quantity: 120,
  remaining_quantity: 84,
  supplier: "DISTRIBUCIONES DEL NORTE",
  notes: null,
  created_by: "admin",
  created_at: "2026-09-10T10:00:00Z",
  updated_at: "2026-09-10T10:00:00Z",
};

const productMetric = {
  cod_producto: "SKU-KOMBUCHA-MARACUYA-1L",
  nombre: "Kombucha artesanal de maracuyá presentación familiar",
  cantidad_actual: 84,
  costo_unit: 18_000,
  precio: 25_000,
  valor_inventario: 1_512_000,
  revenue_win: 12_000_000,
  unidades_win: 480,
  margen_win: 3_360_000,
  margen_pct: 28,
  velocidad_mensual: 160,
  dias_stock: 16,
  rotacion_anual: 22,
  ultima_venta: "2026-09-26",
  dias_sin_venta: 1,
  ultima_compra: "2026-09-10",
  dias_sin_compra: 17,
  proveedor: "DISTRIBUCIONES DEL NORTE",
  pct_revenue: 7.5,
  rank_rev: 3,
  abc: "A" as const,
  estado: "saludable" as const,
  es_servicio: false,
  accion: "ok" as const,
};

async function authenticate(page: Page, width: number, tenant = "motoshop"): Promise<void> {
  await page.setViewportSize({ width, height: 844 });
  await page.context().addCookies([
    { name: "motoshop_token", value: "test-token", domain: "localhost", path: "/" },
    { name: "motoshop_tenant", value: tenant, domain: "localhost", path: "/" },
  ]);
  await page.addInitScript(({ features, activeTenant }) => {
    window.localStorage.setItem("motoshop_auth", JSON.stringify({
      state: {
        user: "admin",
        role: "admin",
        isAuthenticated: true,
        currentTenant: activeTenant,
        availableTenants: ["motoshop", "masvital"],
        enabledFeatures: features,
        allowedModules: null,
        returnUrl: null,
      },
      version: 0,
    }));
  }, { features: enabledFeatures, activeTenant: tenant });
  await page.route("**/api/auth/me", (route) => {
    const activeTenant = route.request().headers()["x-tenant"] ?? tenant;
    return route.fulfill({ json: {
    username: "admin",
    role: "admin",
    tenants_allowed: ["motoshop", "masvital"],
    current_tenant: activeTenant,
    enabled_features: enabledFeatures,
    allowed_modules: null,
    } });
  });
  await page.route("**/api/auth/refresh", (route) => route.fulfill({ status: 204 }));
}

async function openPurchasesByProvider(page: Page, width: number): Promise<void> {
  await authenticate(page, width);
  await page.route("**/api/metrics/compras-por-proveedor**", (route) =>
    route.fulfill({ json: providerResponse }),
  );
  await page.goto("/dashboards/movimientos?modo=compras");
  const viewTabs = page.getByRole("group", { name: "Vistas de compras" });
  await expect(viewTabs.getByRole("button", { name: /Mensual/ })).toBeVisible();
  await expect(viewTabs.getByRole("button", { name: /Por proveedor/ })).toBeVisible();
  await expect(viewTabs.getByRole("button", { name: /Histórica/ })).toBeVisible();
  await expect(viewTabs.getByRole("button", { name: /Buscar/ })).toBeVisible();
  await page.getByRole("button", { name: /Por proveedor/ }).click();
  await expect(page.getByRole("heading", { name: "4 proveedores en el rango" })).toBeVisible();
}

for (const width of [320, 375, 390, 430, 768]) {
  test(`Compras por proveedor fits mobile width ${width}px`, async ({ page }) => {
    await openPurchasesByProvider(page, width);

    const providerList = page.getByRole("list", { name: "Proveedores del período" });
    await expect(providerList).toBeVisible();
    await expect(providerList.getByText("DISTRIBUCIONES Y ALIMENTOS LA ESQUINA DEL NORTE S.A.S.")).toBeVisible();
    await expect(providerList.getByText("NIT 1010119448")).toBeVisible();
    await expect(providerList.getByText("6.749.419")).toBeVisible();

    const widths = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
    }));
    expect(widths.document).toBeLessThanOrEqual(widths.viewport + 1);
  });
}

test("Compras por proveedor keeps its desktop table on wide screens", async ({ page }) => {
  await openPurchasesByProvider(page, 1280);

  await expect(page.getByRole("table", { name: "Compras por proveedor" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Proveedores del período" })).toBeHidden();
});

test("supplier profile shows products and invoices as readable mobile cards", async ({ page }) => {
  await authenticate(page, 375);
  await page.route("**/api/metrics/compras-proveedor-perfil**", (route) =>
    route.fulfill({ json: supplierProfileResponse }),
  );
  await page.goto("/dashboards/compras/proveedores/1010119448");

  await expect(page.getByRole("list", { name: "Productos más comprados al proveedor" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Historial de compras del proveedor" })).toBeVisible();
  await expect(
    page.getByRole("list", { name: "Productos más comprados al proveedor" })
      .getByText("Kombucha artesanal de maracuyá presentación familiar"),
  ).toBeVisible();
  await expect(
    page.getByRole("list", { name: "Productos más comprados al proveedor" })
      .getByText("SKU123456789012345678901234567890ABCDEFGHIJ"),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Abrir factura 194 clase FC" })).toHaveAttribute(
    "href",
    "/dashboards/compras/dia/2026-09-10/documento/194?cod_clase=FC",
  );

  const widths = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  expect(widths.document).toBeLessThanOrEqual(widths.viewport + 1);
});

test("purchase document keeps product values readable without horizontal page scrolling", async ({ page }) => {
  await authenticate(page, 375);
  await page.route("**/api/metrics/purchases-day-grouped**", (route) => route.fulfill({ json: {
    date: "2026-09-10",
    total_compras: 3_000_000,
    total_documentos: 1,
    documentos: [{
      num_documento: "194",
      cod_clase: "FC",
      nit_proveedor: "1010119448",
      nombre_proveedor: "DISTRIBUCIONES DEL NORTE",
      total_factura: 3_000_000,
      num_items: 1,
      items: [{
        cod_producto: "SKU123456789012345678901234567890ABCDEFGHIJ",
        nom_producto: "Kombucha artesanal de maracuyá presentación familiar",
        cantidad: 120,
        valor_unitario: 25_000,
        costo_producto: 18_000,
        total: 3_000_000,
        unidad_medida: "unidad",
      }],
    }],
  } }));
  await page.goto("/dashboards/compras/dia/2026-09-10/documento/194?cod_clase=FC");

  await expect(page.getByRole("list", { name: "Productos de la factura" })).toBeVisible();
  await expect(page.getByText("Costo unitario")).toBeVisible();
  await expect(page.getByText("3.000.000", { exact: false }).first()).toBeVisible();
  const widths = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  expect(widths.document).toBeLessThanOrEqual(widths.viewport + 1);
});

test("daily purchase expansion wraps long SKUs and preserves every product metric on mobile", async ({ page }) => {
  await authenticate(page, 320);
  await page.route("**/api/metrics/purchases-day-grouped**", (route) => route.fulfill({ json: {
    date: "2026-09-10",
    total_compras: 3_000_000,
    total_documentos: 1,
    documentos: [{
      num_documento: "194",
      cod_clase: "FC",
      nit_proveedor: "1010119448",
      nombre_proveedor: "DISTRIBUCIONES DEL NORTE",
      total_factura: 3_000_000,
      num_items: 1,
      items: [{
        cod_producto: "SKU123456789012345678901234567890ABCDEFGHIJ",
        nom_producto: "Kombucha artesanal de maracuyá presentación familiar",
        cantidad: 120,
        valor_unitario: 25_000,
        costo_producto: 18_000,
        total: 3_000_000,
        unidad_medida: "unidad",
      }],
    }],
  } }));
  await page.goto("/dashboards/compras/dia/2026-09-10");

  await page.getByRole("button", { name: "Mostrar productos" }).click();
  const itemCards = page.getByRole("list", { name: "Productos de factura 194" });
  await expect(itemCards).toBeVisible();
  await expect(itemCards.getByText("SKU123456789012345678901234567890ABCDEFGHIJ")).toBeVisible();
  await expect(itemCards.getByText("Valor unitario")).toBeVisible();
  await expect(itemCards.getByText("Total del producto")).toBeVisible();
  const widths = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  expect(widths.document).toBeLessThanOrEqual(widths.viewport + 1);
});

test("purchase calendar uses compact mobile values without clipping the 7-day grid", async ({ page }) => {
  await authenticate(page, 320);
  await page.route("**/api/metrics/compras-overview**", (route) => {
    const month = new URL(route.request().url()).searchParams.get("month") ?? "2026-09";
    return route.fulfill({ json: {
      month,
      total_compras: 6_781_419,
      total_documentos: 8,
      proveedores_unicos: 4,
      ticket_promedio: 847_677,
      dias: [
        { date: `${month}-01`, day: 1, total: 6_749_419, num_documentos: 7 },
        { date: `${month}-02`, day: 2, total: -1_200_000, num_documentos: 1 },
        { date: `${month}-03`, day: 3, total: 999_999, num_documentos: 4 },
      ],
      top_proveedores: [],
      top_productos: [],
    } });
  });
  await page.goto("/dashboards/movimientos?modo=compras");

  await expect(page.getByText("$6.7M", { exact: true })).toBeVisible();
  await expect(page.getByText("$-1.2M", { exact: true })).toBeVisible();
  await expect(page.getByText("$1.0M", { exact: true })).toBeVisible();
  const widths = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  expect(widths.document).toBeLessThanOrEqual(widths.viewport + 1);
});

test("supplier analysis keeps the metrics and sort/search controls usable on mobile", async ({ page }) => {
  await authenticate(page, 320);
  await page.route("**/api/metrics/**", (route) => route.fulfill({ json: {} }));
  await page.route("**/api/metrics/analisis-proveedores**", (route) =>
    route.fulfill({ json: supplierAnalysisResponse }),
  );
  await page.goto("/dashboards/analisis?tab=proveedores");

  const suppliers = page.getByRole("list", { name: "Proveedores analizados" });
  await expect(suppliers).toBeVisible();
  await expect(suppliers.getByText("Ratio venta/compra")).toBeVisible();
  await expect(suppliers.getByText("3.800.000", { exact: false })).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "Buscar proveedor analizado o NIT" })).toBeVisible();
  const widths = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  expect(widths.document).toBeLessThanOrEqual(widths.viewport + 1);
});

test("expiry lot records render as scannable cards on mobile", async ({ page }) => {
  await authenticate(page, 375, "masvital");
  await page.route("**/api/expiry/lots**", (route) => {
    const status = new URL(route.request().url()).searchParams.get("status");
    return route.fulfill({ json: {
      items: status === "active" ? [expiryLot] : [],
      total: status === "active" ? 1 : 0,
      limit: 200,
      offset: 0,
    } });
  });
  await page.route("**/api/metrics/**", (route) => route.fulfill({ json: { proveedores: [] } }));
  await page.goto("/dashboards/inventario?tab=caducidad");

  const inventoryViews = page.getByRole("group", { name: "Vistas de inventario" });
  await expect(inventoryViews.getByRole("button", { name: /Resumen/ })).toBeVisible();
  await expect(inventoryViews.getByRole("button", { name: /Catálogo/ })).toBeVisible();
  await expect(inventoryViews.getByRole("button", { name: /Rotación/ })).toBeVisible();
  await expect(inventoryViews.getByRole("button", { name: /Caducidad/ })).toBeVisible();

  const activeLots = page.getByRole("list", { name: "Lotes activos por vencer" });
  await expect(activeLots).toBeVisible();
  await expect(activeLots.getByText("LOTE-MARACUYA-2026-09-A")).toBeVisible();
  await expect(activeLots.getByText("FACTURA-194")).toBeVisible();
  await expect(activeLots.getByRole("button", { name: "Editar lote" })).toBeVisible();
  const widths = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  expect(widths.document).toBeLessThanOrEqual(widths.viewport + 1);
});

test("inventory catalog cards keep product metrics available on narrow mobile", async ({ page }) => {
  await authenticate(page, 320);
  await page.route("**/api/metrics/product-analytics**", (route) => route.fulfill({ json: {
    window_days: 180,
    page: 1,
    page_size: 50,
    total: 1,
    items: [productMetric],
  } }));
  await page.goto("/dashboards/inventario?tab=catalogo");

  const products = page.getByRole("list", { name: "Resultados del catálogo" });
  await expect(products).toBeVisible();
  await expect(products.getByText("Kombucha artesanal de maracuyá presentación familiar")).toBeVisible();
  await expect(products.getByText("Valor inventario")).toBeVisible();
  await expect(products.getByRole("button")).toContainText("84");
  const widths = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  expect(widths.document).toBeLessThanOrEqual(widths.viewport + 1);
});

test("scoped purchase recommendations are readable cards on mobile", async ({ page }) => {
  await authenticate(page, 320);
  await page.route("**/api/metrics/**", (route) => route.fulfill({ json: {} }));
  await page.route("**/api/metrics/product-analytics**", (route) => route.fulfill({ json: {
    window_days: 180,
    page: 1,
    page_size: 50,
    total: 1,
    items: [productMetric],
  } }));
  await page.goto("/dashboards/decisiones?tab=comprar&scope=por_agotarse");

  const decisionViews = page.getByRole("group", { name: "Vistas de decisiones" });
  await expect(decisionViews.getByRole("button", { name: /Comprar/ })).toBeVisible();
  await expect(decisionViews.getByRole("button", { name: /Vender/ })).toBeVisible();
  await expect(decisionViews.getByRole("button", { name: /Demanda/ })).toBeVisible();
  const scopedProducts = page.getByRole("list", { name: /Por agotarse/ });
  await expect(scopedProducts).toBeVisible();
  await expect(scopedProducts.getByText("Sugerido comprar")).toBeVisible();
  await expect(scopedProducts.getByText("Costo estimado")).toBeVisible();
  const widths = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  expect(widths.document).toBeLessThanOrEqual(widths.viewport + 1);
});
