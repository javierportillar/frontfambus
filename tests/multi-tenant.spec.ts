import { test, expect } from "@playwright/test";

test.describe("Multi-tenant (M2)", () => {
  test("login con usuario multi-tenant redirige a /select-tenant", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[placeholder="Tu usuario"]', "admin");
    await page.fill('input[placeholder="Tu contraseña"]', "admin");
    await page.click('button[type="submit"]');

    // Esperar a /select-tenant (usuario admin tiene ambos tenants)
    await expect(page).toHaveURL(/\/select-tenant/, { timeout: 10000 });
  });

  test("/select-tenant muestra opciones de negocio", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[placeholder="Tu usuario"]', "admin");
    await page.fill('input[placeholder="Tu contraseña"]', "admin");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/select-tenant/, { timeout: 10000 });

    // Deberían verse las cards de tenant
    await expect(page.locator("text=MotoShop")).toBeVisible();
    await expect(page.locator("text=MasVital")).toBeVisible();
  });

  test("seleccionar tenant redirige al home y muestra el nombre en sidebar", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[placeholder="Tu usuario"]', "admin");
    await page.fill('input[placeholder="Tu contraseña"]', "admin");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/select-tenant/, { timeout: 10000 });

    // Click en MotoShop
    await page.locator("text=MotoShop").first().click();
    await expect(page).toHaveURL("/", { timeout: 10000 });

    // Sidebar debe mostrar el nombre del tenant
    await expect(page.locator("text=MotoShop").first()).toBeVisible();
  });

  test("feature deshabilitada muestra FeatureGuard en lugar de dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[placeholder="Tu usuario"]', "admin");
    await page.fill('input[placeholder="Tu contraseña"]', "admin");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/select-tenant/, { timeout: 10000 });

    // Seleccionar MasVital (que tiene menos features)
    await page.locator("text=MasVital").first().click();
    await expect(page).toHaveURL("/", { timeout: 10000 });

    // Navegar a /forecast — debería estar deshabilitado
    await page.goto("/forecast");
    await expect(page.locator("text=no disponible")).toBeVisible({ timeout: 5000 });
  });

  test("sidebar no muestra enlaces a features deshabilitadas", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[placeholder="Tu usuario"]', "admin");
    await page.fill('input[placeholder="Tu contraseña"]', "admin");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/select-tenant/, { timeout: 10000 });

    // Seleccionar MasVital
    await page.locator("text=MasVital").first().click();
    await expect(page).toHaveURL("/", { timeout: 10000 });

    // Forecast NO debería estar en el sidebar
    await expect(page.locator("aside").locator("text=Forecast")).not.toBeVisible();

    // Inventario SÍ debería estar (feature habilitada)
    await expect(page.locator("aside").locator("text=Inventario")).toBeVisible();
  });

  test("cambiar negocio vuelve al selector", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[placeholder="Tu usuario"]', "admin");
    await page.fill('input[placeholder="Tu contraseña"]', "admin");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/select-tenant/, { timeout: 10000 });

    // Seleccionar tenant
    await page.locator("text=MotoShop").first().click();
    await expect(page).toHaveURL("/", { timeout: 10000 });

    // Click en "Cambiar negocio" en sidebar
    await page.locator("text=Cambiar negocio").click();
    await expect(page).toHaveURL(/\/select-tenant/, { timeout: 10000 });
  });

  test("home page muestra nombre del tenant activo", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[placeholder="Tu usuario"]', "admin");
    await page.fill('input[placeholder="Tu contraseña"]', "admin");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/select-tenant/, { timeout: 10000 });

    // MasVital
    await page.locator("text=MasVital").first().click();
    await expect(page).toHaveURL("/", { timeout: 10000 });

    // El header debe decir MasVital, no MotoShop
    await expect(page.locator("h1").first()).toHaveText("MasVital");
  });
});
