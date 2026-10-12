import { test, expect } from "@playwright/test";

/**
 * Live E2E for the Clientes module.
 *
 * Requires a running backend with real DuckDB snapshots and the local dev user
 * (see motoshop-app/api/out/dev_users.yaml: devadmin / dev12345), plus
 * NEXT_PUBLIC_API_URL=http://localhost:8000 in the frontend .env.local.
 *
 * Skipped by default so it never breaks CI (which has no live backend).
 * Run explicitly:  E2E_LIVE=1 npx playwright test tests/clientes-live.spec.ts
 */
test.skip(!process.env.E2E_LIVE, "live backend required (set E2E_LIVE=1)");

const USER = process.env.E2E_USER ?? "devadmin";
const PASS = process.env.E2E_PASS ?? "dev12345";
const RANGE = "fecha_inicio=2024-01-01&fecha_fin=2026-10-12";

async function loginAsMotoshop(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/login");
  await page.fill('input[placeholder="Tu usuario"]', USER);
  await page.fill('input[placeholder="Tu contraseña"]', PASS);
  await page.click('button[type="submit"]');

  await page.waitForURL(/select-tenant|\/dashboards|\/(\?|$)/, { timeout: 20000 });
  if (page.url().includes("/select-tenant")) {
    await page.getByText(/MotoShop/i).first().click();
    await page.waitForURL((url) => !url.pathname.includes("select-tenant"), { timeout: 20000 });
  }
}

test.describe("Clientes · live data", () => {
  test("directorio muestra ranking, resumen y resuelve el perfil con datos reales", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/login");
    await page.fill('input[placeholder="Tu usuario"]', USER);
    await page.fill('input[placeholder="Tu contraseña"]', PASS);
    await page.click('button[type="submit"]');
    await page.waitForURL(/select-tenant|\/dashboards|\/$/, { timeout: 15000 });
    if (page.url().includes("select-tenant")) {
      await page.getByText(/MotoShop/i).first().click();
      await page.waitForURL((url) => !url.pathname.includes("select-tenant"), { timeout: 15000 });
    }

    await page.goto(`/dashboards/clientes?${RANGE}`);
    await expect(page.getByRole("heading", { name: "Clientes", level: 1 })).toBeVisible();

    // Summary cards must render with real values, not the error state.
    await expect(page.getByText("Clientes identificados")).toBeVisible();
    await expect(
      page.getByText("No pudimos cargar los clientes"),
    ).toHaveCount(0);

    // Ranking table populated with real rows.
    const table = page.getByRole("table", { name: "Clientes del período" });
    await expect(table).toBeVisible();
    const firstRow = table.locator("tbody tr").first();
    await expect(firstRow).toBeVisible();
    const customerLink = firstRow.getByRole("link").first();
    const customerName = (await customerLink.textContent())?.trim() ?? "";
    expect(customerName.length).toBeGreaterThan(2);

    // Navigate to the customer profile.
    await customerLink.click();
    await expect(page.getByRole("heading", { name: "Resumen del cliente" })).toBeVisible();
    await expect(page.getByRole("heading", { name: customerName })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Productos más comprados" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Facturas del cliente" })).toBeVisible();
  });
});
