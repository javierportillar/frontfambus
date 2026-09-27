import { test, expect, type Page, type Route } from "@playwright/test";

type TestAttachment = {
  type: "report";
  format: "pdf";
  filename: string;
  download_url: string;
  state: "available" | "expired";
  expires_at: string;
  date_from: string;
  date_to: string;
  period_label: string;
};

type TestReply = {
  status: "partial";
  tenant_id: string;
  text: string;
  conversation_id: string;
  turn_count: number;
  tools_used: string[];
  sources: Array<Record<string, string>>;
  freshness: Array<Record<string, string>>;
  entity_refs: Array<{
    entity_type: string;
    entity_id: string;
    label: string;
    label_is_unique?: boolean;
    domain: string;
    href: string;
  }>;
  attachments: TestAttachment[];
};

const assistantReply: TestReply = {
  status: "partial",
  tenant_id: "motoshop",
  text: "Ventas disponibles.",
  conversation_id: "conversation-1",
  turn_count: 1,
  tools_used: ["sales"],
  sources: [{
    source_id: "sales-snapshot",
    domain: "sales",
    kind: "duckdb",
    citation: "Ventas del corte",
    cutoff_at: "2026-09-13",
    observed_at: "2026-09-15T10:00:00+00:00",
    status: "used",
  }],
  freshness: [{
    domain: "sales",
    cutoff_at: "2026-09-13",
    observed_at: "2026-09-15T10:00:00+00:00",
    status: "current",
  }],
  entity_refs: [{
    entity_type: "product",
    entity_id: "SKU-1",
    label: "Filtro",
    domain: "inventory",
    href: "/dashboards/productos/SKU-1",
  }],
  attachments: [{
    type: "report",
    format: "pdf",
    filename: "ventas.pdf",
    download_url: "/api/reports/download/rep-1",
    state: "available",
    expires_at: "2099-09-15T10:00:00+00:00",
    date_from: "2026-09-01",
    date_to: "2026-09-13",
    period_label: "Septiembre 2026",
  }],
};

const expiredReply: TestReply = {
  ...assistantReply,
  text: "El reporte anterior expiró.",
  attachments: [{
    ...assistantReply.attachments[0]!,
    state: "expired",
    expires_at: "2026-09-14T10:00:00+00:00",
  }],
};

function persistedState(tenant = "motoshop") {
  return JSON.stringify({
    state: {
      user: "admin",
      role: "admin",
      isAuthenticated: true,
      currentTenant: tenant,
      availableTenants: ["motoshop", "masvital"],
      enabledFeatures: ["chat-ia", "ventas-summary", "inventario", "alerts", "dormidos", "abc", "analisis", "forecast"],
      allowedModules: null,
      returnUrl: null,
    },
    version: 0,
  });
}

async function seedSession(page: Page, reply = assistantReply, tenant = "motoshop") {
  await page.context().addCookies([
    { name: "motoshop_token", value: "test-token", domain: "localhost", path: "/" },
    { name: "motoshop_tenant", value: tenant, domain: "localhost", path: "/" },
  ]);
  await page.addInitScript((state) => {
    window.localStorage.setItem("motoshop_auth", state);
  }, persistedState(tenant));

  await page.route("**/api/auth/me", (route: Route) => {
    const activeTenant = route.request().headers()["x-tenant"] ?? tenant;
    return route.fulfill({ json: {
      username: "admin",
      role: "admin",
      tenants_allowed: ["motoshop", "masvital"],
      current_tenant: activeTenant,
      enabled_features: ["chat-ia", "ventas-summary", "inventario", "alerts", "dormidos", "abc", "analisis", "forecast"],
      allowed_modules: null,
    } });
  });
  await page.route("**/api/auth/refresh", (route) => route.fulfill({ status: 204 }));
  await page.route("**/api/llm/qa/chat", (route: Route) => route.fulfill({ json: reply }));
  await page.route("**/api/llm/chat/conversations", (route: Route) => {
    if (route.request().method() === "POST") return route.fulfill({ json: {
      id: "conversation-1", tenant_id: tenant, user_id: "admin", title: "Ventas de septiembre",
      status: "active", created_at: "2026-09-15T10:00:00Z", updated_at: "2026-09-15T10:00:00Z",
      last_message_at: "2026-09-15T10:00:00Z", message_count: 2,
    } });
    return route.fulfill({ json: [{
      id: "conversation-1", tenant_id: tenant, user_id: "admin", title: "Ventas de septiembre",
      status: "active", created_at: "2026-09-15T10:00:00Z", updated_at: "2026-09-15T10:00:00Z",
      last_message_at: "2026-09-15T10:00:00Z", message_count: 2,
    }] });
  });
  await page.route("**/api/llm/chat/conversations/*/messages", (route: Route) => route.fulfill({ json: [
    { id: "user-1", conversation_id: "conversation-1", tenant_id: tenant, user_id: "admin", role: "user", content: "ventas", created_at: "2026-09-15T10:00:00Z" },
    { id: "assistant-1", user_id: "admin", role: "assistant", content: reply.text, created_at: "2026-09-15T10:00:01Z", ...reply },
  ] }));
}

test.describe("Governed assistant cross-repository contract", () => {
  test("opens the dedicated assistant module and downloads an authorized report", async ({ page }) => {
    await seedSession(page);
    await page.route("**/api/reports/download/rep-1", (route) => route.fulfill({
      status: 200,
      body: "fake report",
      headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="ventas.pdf"' },
    }));

    await page.goto("/");
    await page.getByRole("link", { name: "Abrir asistente de negocio" }).click();
    await expect(page).toHaveURL(/\/chat$/);
    await page.getByLabel("Pregunta al asistente").fill("¿Cómo están las ventas?");
    await page.getByRole("button", { name: "Enviar" }).click();
    const fullPageMessage = page.getByRole("article", { name: "Mensaje del asistente: Respuesta parcial" });
    await expect(fullPageMessage).toContainText("Ventas disponibles.");
    await expect(fullPageMessage).toContainText("Ventas del corte");
    await expect(fullPageMessage).toContainText("sales: current");
    await expect(fullPageMessage.getByRole("link", { name: "Filtro" })).toHaveAttribute("href", "/dashboards/productos/SKU-1");
    await expect(page.getByText(/Enviado ·/)).toBeVisible();
    await expect(page.getByText(/Respondido ·/)).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await fullPageMessage.getByRole("link", { name: "Descargar PDF" }).click();
    expect((await downloadPromise).suggestedFilename()).toBe("ventas.pdf");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("opens the dedicated assistant module from the mobile launcher", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedSession(page);
    await page.goto("/");

    const launcher = page.getByRole("link", { name: "Abrir asistente de negocio" });
    await expect(launcher).toBeVisible();
    await launcher.click();

    await expect(page).toHaveURL(/\/chat$/);
    await expect(page.getByRole("heading", { name: /(?:Buenos días|Buenas tardes|Buenas noches), Admin/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "Asistente IA" })).toBeVisible();
  });

  test("marks expired reports unavailable and clears assistant state after tenant switch", async ({ page }) => {
    await seedSession(page, expiredReply);
    await page.goto("/chat");
    await page.getByLabel("Pregunta al asistente").fill("ventas");
    await page.getByRole("button", { name: "Enviar" }).click();
    await expect(page.getByRole("article", { name: "Mensaje del asistente: Respuesta parcial" })).toContainText("Este reporte expiró");
    await expect(page.getByRole("link", { name: "Descargar PDF" })).toHaveCount(0);

    await page.getByRole("button", { name: "Cambiar negocio" }).click();
    await expect(page).toHaveURL(/\/select-tenant/);
    await page.getByRole("button", { name: /MasVital/ }).click();
    await expect(page).toHaveURL("/");
    await page.goto("/chat");
    await expect(page.getByRole("heading", { name: /(?:Buenos días|Buenas tardes|Buenas noches), Admin/ })).toBeVisible();
    await expect(page.getByText("El reporte anterior expiró.")).toHaveCount(0);
  });

  for (const tenant of ["motoshop", "masvital"] as const) {
    test(`${tenant} product mentions open the matching detail page`, async ({ page }) => {
      const productReply: TestReply = {
        ...assistantReply,
        tenant_id: tenant,
        text: "Producto BONNAT001 SALSAS MRS TASTE para revisar.\n\n| Código | Producto |\n| --- | --- |\n| BONNAT001 | SALSAS MRS TASTE |",
        entity_refs: [{
          entity_type: "product",
          entity_id: "BONNAT001",
          label: "SALSAS MRS TASTE",
          domain: "inventory",
          href: "/dashboards/productos/BONNAT001",
        }],
      };
      await seedSession(page, productReply, tenant);
      await page.route("**/api/metrics/product-detail*", (route) => route.fulfill({ json: {
        found: true,
        sku: "BONNAT001",
        window_days: 180,
        metrics: {
          cod_producto: "BONNAT001",
          nombre: "SALSAS MRS TASTE",
          stock_source: tenant === "masvital" ? "catalog_snapshot" : "purchases_minus_sales_estimate",
          comprado_total: 33,
          vendido_total: 3,
          cantidad_actual: 9,
          costo_unit: 100,
          precio: 200,
          valor_inventario: 900,
          revenue_win: 600,
          unidades_win: 3,
          margen_win: 300,
          margen_pct: 50,
          velocidad_mensual: 0.5,
          dias_stock: 540,
          rotacion_anual: 0.7,
          ultima_venta: "2026-09-20",
          dias_sin_venta: 7,
          ultima_compra: "2026-09-18",
          dias_sin_compra: 9,
          proveedor: "Proveedor de prueba",
          pct_revenue: 1,
          rank_rev: 1,
          abc: "B",
          estado: "saludable",
          es_servicio: false,
          accion: "ok",
        },
        timeline: [],
        movimientos: [],
      } }));

      await page.goto("/chat");
      await page.getByLabel("Pregunta al asistente").fill("Revisa el producto BONNAT001");
      await page.getByRole("button", { name: "Enviar" }).click();

      const answer = page.getByRole("article", { name: "Mensaje del asistente: Respuesta parcial" });
      await expect(answer).toHaveCount(1);
      const nameLinks = answer.getByRole("link", { name: "Ver ficha de SALSAS MRS TASTE", exact: true });
      await expect(nameLinks).toHaveCount(2);
      const tableProductLink = answer.getByRole("table").getByRole("link", {
        name: "Ver ficha de SALSAS MRS TASTE",
        exact: true,
      });
      await expect(tableProductLink).toHaveAttribute(
        "href",
        "/dashboards/productos/BONNAT001",
      );
      await tableProductLink.click();

      await expect(page).toHaveURL(/\/dashboards\/productos\/BONNAT001$/);
      await expect(page.getByRole("heading", { name: "SALSAS MRS TASTE" })).toBeVisible();
      if (tenant === "masvital") {
        await expect(page.getByText(/snapshot vigente del catálogo de MasVital/)).toBeVisible();
      } else {
        await expect(page.getByText(/compradas históricas − 3 u vendidas históricas/)).toBeVisible();
      }
    });
  }
});

function purchaseReply(tenant: string): TestReply {
  return {
    ...assistantReply,
    tenant_id: tenant,
    text: "Factura 9081 del proveedor Distribuidora Norte (NIT: 900123456). Total $125000.",
    tools_used: ["get_detalle_compra"],
    entity_refs: [
      {
        entity_type: "purchase_document",
        entity_id: "2026-09-10|FV|9081",
        label: "Factura 9081",
        domain: "purchases",
        href: "/dashboards/compras/dia/2026-09-10/documento/9081?cod_clase=FV",
      },
      {
        entity_type: "supplier",
        entity_id: "900123456",
        label: "Distribuidora Norte",
        label_is_unique: true,
        domain: "purchases",
        href: "/dashboards/compras/proveedores/900123456",
      },
    ],
    attachments: [],
  };
}

async function mockPurchaseProfileApis(page: Page) {
  await page.route("**/api/metrics/compras-proveedor-perfil*", (route) => route.fulfill({ json: {
    proveedor: { nit: "900123456", nombre: "Distribuidora Norte" },
    periodo: { fecha_inicio: "2025-09-27", fecha_fin: "2026-09-27" },
    compras: {
      total_compras: 125000,
      num_documentos: 1,
      ticket_promedio: 125000,
      primera_compra: "2026-09-10",
      ultima_compra: "2026-09-10",
      skus_distintos: 1,
      productos_top: [],
    },
    ventas_estimadas: {
      revenue: 240000,
      revenue_with_cost: 240000,
      margen_cobertura_pct: 100,
      margen: 85000,
      margen_pct: 35.4,
      skus_vendidos: 1,
      skus_con_costo: 1,
      metodo_atribucion: {
        id: "latest_supplier_per_sku",
        descripcion: "Atribución de cada SKU a su proveedor conocido más reciente.",
      },
    },
    documentos: [{
      business_date: "2026-09-10",
      cod_clase: "FV",
      num_documento: "9081",
      total_factura: 125000,
      num_items: 1,
    }],
    paginacion: { page: 1, page_size: 20, total_documentos: 1, has_more: false },
  } }));
  await page.route("**/api/metrics/purchases-day-grouped*", (route) => route.fulfill({ json: {
    date: "2026-09-10",
    total_compras: 125000,
    total_documentos: 1,
    documentos: [{
      num_documento: "9081",
      cod_clase: "FV",
      nit_proveedor: "900123456",
      nombre_proveedor: "Distribuidora Norte",
      total_factura: 125000,
      num_items: 1,
      items: [],
    }],
  } }));
}

for (const tenant of ["motoshop", "masvital"] as const) {
  test(`${tenant} assistant document reference opens the exact purchase identity`, async ({ page }) => {
    await seedSession(page, purchaseReply(tenant), tenant);
    await mockPurchaseProfileApis(page);
    await page.goto("/chat");
    await page.getByLabel("Pregunta al asistente").fill("Abre la factura del proveedor");
    await page.getByRole("button", { name: "Enviar" }).click();

    const answer = page.getByRole("article", { name: "Mensaje del asistente: Respuesta parcial" });
    const documentLink = answer.getByRole("link", { name: "Ver factura 9081" });
    await expect(documentLink).toHaveAttribute(
      "href",
      "/dashboards/compras/dia/2026-09-10/documento/9081?cod_clase=FV",
    );
    await documentLink.click();

    await expect(page).toHaveURL(/\/dashboards\/compras\/dia\/2026-09-10\/documento\/9081\?cod_clase=FV$/);
    await expect(page.getByRole("heading", { name: "Detalle de la compra" })).toBeVisible();
    await expect(page.getByText("Distribuidora Norte")).toBeVisible();
  });

  test(`${tenant} assistant supplier link opens its profile and an exact purchase document`, async ({ page }) => {
    await seedSession(page, purchaseReply(tenant), tenant);
    await mockPurchaseProfileApis(page);
    await page.goto("/chat");
    await page.getByLabel("Pregunta al asistente").fill("Muestra el proveedor y su factura");
    await page.getByRole("button", { name: "Enviar" }).click();

    const answer = page.getByRole("article", { name: "Mensaje del asistente: Respuesta parcial" });
    await answer.getByRole("link", { name: "Ver ficha de proveedor Distribuidora Norte" }).click();
    await expect(page).toHaveURL(/\/dashboards\/compras\/proveedores\/900123456$/);
    await expect(page.getByRole("heading", { name: "Distribuidora Norte" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Compras al proveedor" })).toBeVisible();
    await expect(page.getByText(/No representa ventas facturadas directamente/)).toBeVisible();

    await page.getByRole("link", { name: "Factura 9081" }).click();
    await expect(page).toHaveURL(/\/dashboards\/compras\/dia\/2026-09-10\/documento\/9081\?cod_clase=FV$/);
    await expect(page.getByRole("heading", { name: "Detalle de la compra" })).toBeVisible();
  });
}
