import { test, expect, type Page } from "@playwright/test";

/**
 * Página operativa de transferencias contra un backend simulado.
 *
 * Se intercepta `GET /api/erp/bank/movements`, `GET /api/erp/bank/candidates`
 * y `POST /api/erp/bank/reconciliation/{id}/apply`: la página no habla con el
 * banco, sólo con el API del tenant.
 */

const MOV_AMBIGUA = {
  id: "mov-a",
  fecha: "2026-10-20",
  valor: "150000.00",
  descripcion: "PAGO QR NIT 900123456",
  referencia: "0092055984",
  pagadorNombre: "DISTRIBUIDORA EL SOL",
  estado: "AMBIGUA",
  reciboNumero: null,
  confianza: 80,
  razones: "referencia exacta (100) + NIT del pagador (80)",
};

const MOV_PENDIENTE = {
  id: "mov-b",
  fecha: "2026-10-21",
  valor: "55000.00",
  descripcion: "TRANSFERENCIA PENDIENTE",
  referencia: "7777777",
  pagadorNombre: "OTRO PAGADOR",
  estado: "PENDIENTE",
  reciboNumero: null,
  confianza: 40,
  razones: "importe exacto (40)",
};

const CANDIDATO = {
  id: "F-1",
  valor: "150000.00",
  pagadorNombre: "DISTRIBUIDORA EL SOL",
  referencia: "0092055984",
  fecha: "2026-10-20",
};

const FEATURES = ["bank-reconciliation"];

async function bypassAuth(page: Page): Promise<void> {
  await page.context().addCookies([
    {
      name: "motoshop_token",
      value: "fake-jwt-for-e2e",
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
  await page.addInitScript(({ enabledFeatures }) => {
    window.localStorage.setItem(
      "motoshop_auth",
      JSON.stringify({
        state: {
          user: "admin",
          role: "admin",
          isAuthenticated: true,
          currentTenant: "motoshop",
          availableTenants: ["motoshop"],
          enabledFeatures,
          allowedModules: null,
          returnUrl: null,
        },
        version: 0,
      }),
    );
  }, { enabledFeatures: FEATURES });
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      json: {
        username: "admin",
        role: "admin",
        tenants_allowed: ["motoshop"],
        current_tenant: "motoshop",
        enabled_features: FEATURES,
        allowed_modules: null,
      },
    }),
  );
  await page.route("**/api/auth/refresh", (route) =>
    route.fulfill({ status: 204 }),
  );
}

async function mockMovimientos(
  page: Page,
  movimientos: readonly unknown[],
): Promise<void> {
  await page.route("**/api/erp/bank/movements**", (route) =>
    route.fulfill({ json: { movimientos } }),
  );
}

test.describe("Transferencias bancarias", () => {
  test("test_la_pagina_muestra_el_listado_de_movimientos", async ({ page }) => {
    await bypassAuth(page);
    await mockMovimientos(page, [MOV_AMBIGUA, MOV_PENDIENTE]);

    await page.goto("/banco/transferencias");

    await expect(page.getByText("PAGO QR NIT 900123456")).toBeVisible();
    await expect(page.getByText("TRANSFERENCIA PENDIENTE")).toBeVisible();
    await expect(page.getByText("150000.00")).toBeVisible();
    await expect(page.getByText("DISTRIBUIDORA EL SOL")).toBeVisible();
  });

  test("test_el_filtro_por_estado_reduce_la_lista", async ({ page }) => {
    await bypassAuth(page);
    await mockMovimientos(page, [MOV_AMBIGUA, MOV_PENDIENTE]);

    await page.goto("/banco/transferencias");
    await expect(page.getByText("TRANSFERENCIA PENDIENTE")).toBeVisible();

    await page.getByLabel("Filtrar por estado").selectOption("AMBIGUA");

    await expect(page.getByText("PAGO QR NIT 900123456")).toBeVisible();
    await expect(page.getByText("TRANSFERENCIA PENDIENTE")).toBeHidden();
  });

  test("test_la_aplicacion_manual_actualiza_la_fila", async ({ page }) => {
    await bypassAuth(page);
    await page.route("**/api/erp/bank/movements**", (route) =>
      route.fulfill({ json: { movimientos: [MOV_AMBIGUA] } }),
    );
    await page.route("**/api/erp/bank/candidates**", (route) =>
      route.fulfill({
        json: {
          ambiguo: false,
          ventana: { desde: "2026-10-20", hasta: "2026-10-20" },
          candidatos: [CANDIDATO],
          ultimaIngestaAt: "2026-10-20T12:00:00",
        },
      }),
    );
    await page.route("**/api/erp/bank/reconciliation/**", async (route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        json: {
          movimiento_id: MOV_AMBIGUA.id,
          documento: "0002",
          prefijo: "S01",
          replay: false,
        },
      });
    });

    await page.goto("/banco/transferencias");
    await page.getByRole("button", { name: "Aplicar" }).click();
    await page.getByRole("button", { name: "Buscar facturas candidatas" }).click();
    await page.getByRole("radio", { name: /F-1/ }).check();

    await page.route("**/api/erp/bank/movements**", (route) =>
      route.fulfill({
        json: {
          movimientos: [
            { ...MOV_AMBIGUA, estado: "APLICADO", reciboNumero: "0002" },
          ],
        },
      }),
    );
    await page.getByRole("button", { name: "Confirmar aplicación" }).click();

    const fila = page.locator("tr", { hasText: "PAGO QR NIT 900123456" });
    await expect(fila).toContainText("Aplicado");
    await expect(fila).toContainText("0002");
  });
});
