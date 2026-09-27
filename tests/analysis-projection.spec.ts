import { test, expect, type Page } from "@playwright/test";

const forecast = {
  current_month: {
    month: "2026-09",
    observed_amount: 100,
    projected_amount: 200,
    daily_rate: 10,
    days_observed: 10,
    days_total: 30,
    confidence: "low",
  },
  next_month: {
    month: "2026-10",
    projected_amount: 310,
    days_total: 31,
    last_year_same_month: 0,
    confidence: "low",
  },
  history: [],
  model_version: "run_rate_v2_rolling90_bt",
  drivers: ["rolling_90d_daily_rate"],
  rate_basis: "rolling_90d_complete",
  rate_window: { start: "2026-06-03", end: "2026-08-31", days_with_sales: 73 },
  backtest_accuracy: {
    confidence: "low",
    sample_months: 3,
    median_absolute_error_pct: 75.5,
    note: "Calibrado con 3 meses cerrados; error absoluto mediano 75.5%.",
  },
};

async function seedAnalysisSession(
  page: Page,
  tenant: "motoshop" | "masvital",
  allowedModules: string[],
): Promise<void> {
  await page.context().addCookies([
    { name: "motoshop_token", value: "e2e-token", domain: "localhost", path: "/" },
    { name: "motoshop_tenant", value: tenant, domain: "localhost", path: "/" },
  ]);
  await page.addInitScript(({ activeTenant, modules }) => {
    window.localStorage.setItem("motoshop_auth", JSON.stringify({
      state: {
        user: "analysis-e2e",
        role: "analista",
        isAuthenticated: true,
        currentTenant: activeTenant,
        availableTenants: ["motoshop", "masvital"],
        enabledFeatures: ["analisis", "forecast"],
        allowedModules: modules,
        returnUrl: null,
      },
      version: 0,
    }));
  }, { activeTenant: tenant, modules: allowedModules });

  await page.route("**/api/auth/me", (route) => route.fulfill({ json: {
    username: "analysis-e2e",
    role: "analista",
    tenants_allowed: ["motoshop", "masvital"],
    current_tenant: tenant,
    enabled_features: ["analisis", "forecast"],
    allowed_modules: allowedModules,
  } }));
  await page.route("**/api/auth/refresh", (route) => route.fulfill({ status: 204 }));
  await page.route("**/api/metrics/sales-forecast-monthly*", (route) => route.fulfill({ json: forecast }));
}

for (const tenant of ["motoshop", "masvital"] as const) {
  test(`${tenant} analysis-only user can open the monthly projection`, async ({ page }) => {
    await seedAnalysisSession(page, tenant, ["analisis"]);

    await page.goto("/dashboards/analisis?tab=proyeccion");

    await expect(page.getByRole("tab", { name: /Proyección/ })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tab", { name: /Balance/ })).toBeVisible();
    await expect(page.getByRole("status")).toContainText("Confianza baja según backtest");
    await expect(page.getByRole("status")).toContainText("75.5%");
  });
}

test("forecast-only user sees the projection but not other Analysis tabs", async ({ page }) => {
  await seedAnalysisSession(page, "masvital", ["forecast"]);

  await page.goto("/dashboards/analisis?tab=balance");

  await expect(page.getByRole("tablist", { name: "Secciones de análisis" }).getByRole("tab")).toHaveCount(1);
  await expect(page.getByRole("tab", { name: /Proyección/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: /Balance/ })).toHaveCount(0);
});
