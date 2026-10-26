import { test, expect, type Page } from "@playwright/test";

/**
 * Botón "Verificar" del POS contra un backend simulado.
 *
 * El scrape real corre en el nodo local del tenant: aquí se intercepta la
 * ruta de verificaciones (POST = crear job, GET = sondear el job) y la de
 * candidatos por importe.
 */

const PRODUCTO = {
  sku: "OIL-1",
  name: "ACEITE CASTROL 20W50",
  barcode: "7701234567890",
  price: 400000,
  vatPct: 19,
  ipoPct: 0,
  stock: 24,
  category: "Aceites",
  unit: "FRASCO",
  brand: "Castrol",
};

const CANDIDATO = {
  id: "cand-1",
  valor: "476000.00",
  pagadorNombre: "CRISTOPHER BENAMIDES P",
  referencia: "0092055984",
  fecha: "2026-10-21",
};

const CANDIDATO_B = {
  id: "cand-2",
  valor: "476000.00",
  pagadorNombre: "OTRO PAGADOR",
  referencia: "0092055999",
  fecha: "2026-10-21",
};

const JOB_ID = "9f1c2a44-7c0e-4d3a-9c2e-5b6a1d0f3c21";
const EXPIRA_EN = "2099-10-21T12:05:00";

async function bypassAuth(page: Page): Promise<void> {
  const features = ["ventas-summary", "inventario"];
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
  }, { enabledFeatures: features });
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      json: {
        username: "admin",
        role: "admin",
        tenants_allowed: ["motoshop"],
        current_tenant: "motoshop",
        enabled_features: features,
        allowed_modules: null,
      },
    }),
  );
  await page.route("**/api/auth/refresh", (route) =>
    route.fulfill({ status: 204 }),
  );
  await page.route("**/api/pos/products*", (route) =>
    route.fulfill({ json: [PRODUCTO] }),
  );
}

type EstadoJob = "en_cola" | "resuelto" | "sin_coincidencia" | "ambiguo";

/** Intercepta el API de verificación: POST crea el job, GET lo sondea. */
async function mockVerificaciones(
  page: Page,
  estado: EstadoJob,
  opciones: { statusPost?: number } = {},
): Promise<void> {
  await page.route("**/api/erp/bank/verificaciones**", async (route) => {
    const request = route.request();

    if (request.method() === "POST") {
      const body = request.postDataJSON() as Record<string, unknown>;
      expect(body.modo).toBe("pago");
      expect(body.valor).toBe("476000.00");
      expect(body).not.toHaveProperty("factura_id");

      if (opciones.statusPost === 503) {
        await route.fulfill({
          status: 503,
          json: {
            detail: {
              error_codigo: "scraper_no_habilitado",
              message:
                "Este nodo no tiene el scraper del banco habilitado: la verificación se hace desde el nodo local del tenant.",
            },
          },
        });
        return;
      }
      await route.fulfill({
        status: 202,
        json: { job_id: JOB_ID, estado: "en_cola", expira_en: EXPIRA_EN },
      });
      return;
    }

    await route.fulfill({
      status: 200,
      json: {
        job_id: JOB_ID,
        estado,
        expira_en: EXPIRA_EN,
        resultado: {
          ventana: { desde: "2026-10-21", hasta: "2026-10-21" },
          nodo: "nodo-motoshop",
          ingesta_at: "2026-10-21T12:00:00",
          cuenta: "ETIQUETA",
          paginas: 1,
          movimientos: 3,
          candidatos: estado === "ambiguo" ? 2 : estado === "resuelto" ? 1 : 0,
          candidato: estado === "resuelto" ? CANDIDATO : null,
        },
      },
    });
  });

  await page.route("**/api/erp/bank/candidates**", (route) =>
    route.fulfill({
      json: {
        ambiguo: estado === "ambiguo",
        ventana: { desde: "2026-10-21", hasta: "2026-10-21" },
        candidatos: estado === "ambiguo" ? [CANDIDATO, CANDIDATO_B] : [],
        ultimaIngestaAt: "2026-10-21T12:00:00",
      },
    }),
  );
}

/** Abre el POS, mete un producto al carrito y abre el modal de cobro. */
async function abrirModalDeCobro(page: Page): Promise<void> {
  await page.goto("/pos");
  await page.getByRole("button", { name: /ACEITE CASTROL 20W50/ }).click();
  await page.getByRole("button", { name: /Cobrar.*\[F9\]/ }).click();
  await expect(
    page.getByRole("heading", { name: /Finalizar Venta y Cobro/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Transferencia/ }).click();
  await expect(page.locator("#refInput")).toBeVisible();
}

/** Nombre del pagador que muestra el POS (el `<p>` del panel del carrito). */
function pagadorEnPOS(page: Page, nombre: string) {
  return page.getByRole("paragraph").filter({ hasText: new RegExp(`^${nombre}$`) });
}

test.describe("POS · botón Verificar (banco)", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await bypassAuth(page);
  });

  test("test_verificar_prellena_pagador_y_referencia", async ({ page }) => {
    await mockVerificaciones(page, "resuelto");

    await abrirModalDeCobro(page);
    await page.getByRole("button", { name: /Verificar/ }).click();

    await expect(page.locator("#refInput")).toHaveValue("0092055984");
    await expect(pagadorEnPOS(page, "CRISTOPHER BENAMIDES P")).toBeVisible();
  });

  test("test_verificar_no_sobrescribe_la_referencia_manual", async ({ page }) => {
    await mockVerificaciones(page, "resuelto");

    await abrirModalDeCobro(page);
    await page.locator("#refInput").fill("111111111");
    await page.getByRole("button", { name: /Verificar/ }).click();

    await expect(pagadorEnPOS(page, "CRISTOPHER BENAMIDES P")).toBeVisible();
    await expect(page.locator("#refInput")).toHaveValue("111111111");
  });

  test("test_verificar_con_dos_candidatos_ofrece_elegir", async ({ page }) => {
    await mockVerificaciones(page, "ambiguo");

    await abrirModalDeCobro(page);
    await page.getByRole("button", { name: /Verificar/ }).click();

    const elegir = page.getByRole("button", { name: /OTRO PAGADOR/ });
    await expect(elegir).toBeVisible();
    // El sistema no elige por el operador: la referencia sigue vacía.
    await expect(page.locator("#refInput")).toHaveValue("");

    await elegir.click();
    await expect(page.locator("#refInput")).toHaveValue("0092055999");
    await expect(pagadorEnPOS(page, "OTRO PAGADOR")).toBeVisible();
  });

  test("test_verificar_sin_candidatos_no_muestra_error", async ({ page }) => {
    await mockVerificaciones(page, "sin_coincidencia");

    await abrirModalDeCobro(page);
    await page.getByRole("button", { name: /Verificar/ }).click();

    await expect(page.getByRole("status")).toContainText(
      "No se encontró un pago de",
    );
    await expect(page.locator("#refInput")).toHaveValue("");
    await expect(page.locator("dialog").getByRole("alert")).toHaveCount(0);
  });

  test("test_verificar_con_503_mantiene_el_pegado_manual", async ({ page }) => {
    await mockVerificaciones(page, "en_cola", { statusPost: 503 });

    await abrirModalDeCobro(page);
    await page.getByRole("button", { name: /Verificar/ }).click();

    await expect(page.locator("dialog").getByRole("alert")).toContainText(
      "Verificación no disponible",
    );

    // El pegado manual sigue operativo.
    await page
      .getByPlaceholder(/Pega aquí el movimiento/)
      .fill("PAGO QR JUAN PEREZ 0092055984 null $ 476.000");

    await expect(page.locator("#refInput")).toHaveValue("0092055984");
    await expect(pagadorEnPOS(page, "JUAN PEREZ")).toBeVisible();
  });
});
