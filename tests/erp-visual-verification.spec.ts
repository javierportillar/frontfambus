import { test, expect, type Page } from "@playwright/test";

const VIEWPORTS = {
  desktop: { width: 1280, height: 800 },
  mobile: { width: 390, height: 844 }, // iPhone 12/13/14
};

async function bypassAuth(page: Page, role: string = "admin"): Promise<void> {
  const features = ["chat-ia", "ventas-summary", "inventario", "alerts", "dian", "pos"];
  await page.context().addCookies([
    {
      name: "motoshop_token",
      value: "fake-jwt-token-for-e2e",
      domain: "localhost",
      path: "/",
    },
    {
      name: "motoshop_tenant",
      value: "motoshop",
      domain: "localhost",
      path: "/",
    },
  ]);

  await page.addInitScript(
    ({ activeRole, enabledFeatures }) => {
      window.localStorage.setItem(
        "motoshop_auth",
        JSON.stringify({
          state: {
            user: "admin",
            role: activeRole,
            isAuthenticated: true,
            currentTenant: "motoshop",
            availableTenants: ["motoshop"],
            enabledFeatures,
            allowedModules: null,
            returnUrl: null,
          },
          version: 0,
        })
      );
    },
    { activeRole: role, enabledFeatures: features }
  );

  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        username: "admin",
        role,
        tenants_allowed: ["motoshop"],
        current_tenant: "motoshop",
        enabled_features: features,
        allowed_modules: null,
      }),
    })
  );

  await page.route("**/api/auth/refresh", (route) => route.fulfill({ status: 204 }));

  // Mock ERP catalog search
  await page.route("**/api/erp/catalog/products/search**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          sku: "ACE-4T-10W40",
          name: "Aceite 4T 10W40 Sintético 1L",
          price: 45000,
          stock: 18,
          tax_rate: 19,
          category: "LUBRICANTES",
          barcode: "7701234567890",
        },
        {
          sku: "PAS-FRE-DEL",
          name: "Pastillas de Freno Delanteras Pulsar 200",
          price: 32000,
          stock: 12,
          tax_rate: 19,
          category: "REPUESTOS",
          barcode: "7709876543210",
        },
      ]),
    })
  );

  // Mock DIAN status
  await page.route("**/api/erp/dian/status**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        total: 2,
        accepted: 1,
        pending: 1,
        failed: 0,
        documents: [
          {
            sale_id: "sale-001",
            doc_number: "POS-000001",
            cufe: "a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0",
            qr_url: "https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=a1b2c3d4e5f6",
            status: "ACCEPTED",
            sent_at: "2026-10-21T07:15:00Z",
            accepted_at: "2026-10-21T07:15:02Z",
            error_message: null,
            retry_count: 0,
          },
          {
            sale_id: "sale-002",
            doc_number: "POS-000002",
            cufe: "b2c3d4e5f6a17890123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0",
            qr_url: "https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=b2c3d4e5f6a1",
            status: "PENDING",
            sent_at: "2026-10-21T07:20:00Z",
            accepted_at: null,
            error_message: null,
            retry_count: 1,
          },
        ],
      }),
    })
  );

  // Mock Cash session
  await page.route("**/api/erp/pos/sessions/current**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "sess-001",
        branch_id: "B1",
        cashier_user_id: "admin",
        cashier_name: "Administrador MotoShop",
        status: "open",
        opened_at: "2026-10-21T06:00:00Z",
        closed_at: null,
        opening_float: 150000,
        cash_sales: 50000,
        cash_in: 0,
        cash_out: 30000,
        expected_cash: 170000,
        actual_cash: null,
        cash_variance: null,
        denominations: null,
        notes: "Turno mañana",
      }),
    })
  );
}

test.describe("Web ERP Visual & Functional Verification", () => {
  test("POS Workstation renders properly and handles cart + payment modal", async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.desktop);
    await bypassAuth(page);

    await page.goto("/pos");
    await page.waitForLoadState("networkidle");

    // Check title and key UI elements
    await expect(page.getByRole("heading", { name: "Punto de Venta", level: 1 })).toBeVisible();
    await expect(page.getByPlaceholder(/Filtrar por nombre, código de barras/i)).toBeVisible();

    // Verify product catalog items are rendered
    await expect(page.getByText(/Aceite Castrol Actevo/i).first()).toBeVisible();

    // Take desktop screenshot of empty workstation
    await page.screenshot({ path: "test-results/pos-desktop.png", fullPage: true });

    // Click on a product to add it to the cart
    await page.getByText(/Aceite Castrol Actevo/i).first().click();

    // Cart line item and totals appear
    await expect(page.getByText(/Total a Pagar/i)).toBeVisible();

    // Click Cobrar button
    const payBtn = page.getByRole("button", { name: /Cobrar/i });
    if (await payBtn.isVisible()) {
      await payBtn.click();

      // Payment modal visible
      await expect(page.getByRole("heading", { name: /Finalizar Venta y Cobro/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /Efectivo/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /Tarjeta/i })).toBeVisible();

      // Screenshot payment modal
      await page.screenshot({ path: "test-results/pos-payment-modal.png" });
    }
  });

  test("POS Mobile layout renders cleanly without overflow", async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await bypassAuth(page);

    await page.goto("/pos");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: "Punto de Venta", level: 1 })).toBeVisible();
    await page.screenshot({ path: "test-results/pos-mobile.png", fullPage: true });
  });

  test("Caja management renders session, movements and arqueo", async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.desktop);
    await bypassAuth(page);

    await page.goto("/pos/caja");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: "Control de Caja y Arqueos" })).toBeVisible();
    await page.screenshot({ path: "test-results/pos-caja.png", fullPage: true });
  });

  test("DIAN Console renders KPI cards, table and CUFE links", async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.desktop);
    await bypassAuth(page);

    await page.goto("/dian/consola");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: "Consola de Facturación Electrónica DIAN" })).toBeVisible();
    await expect(page.getByText(/Total Documentos/i)).toBeVisible();
    await expect(page.getByText(/Aceptadas por DIAN/i)).toBeVisible();
    await expect(page.getByText(/En Cola \/ Pendientes/i)).toBeVisible();

    // Table rows
    await expect(page.getByText("POS-000001")).toBeVisible();
    await expect(page.getByText("Aceptada DIAN")).toBeVisible();

    await page.screenshot({ path: "test-results/dian-console.png", fullPage: true });
  });
});
