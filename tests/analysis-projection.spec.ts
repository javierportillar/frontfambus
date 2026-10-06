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
  stock_adjusted: {
    current_month: { month: "2026-09", observed_amount: 100, projected_amount: 180, days_total: 30 },
    next_month: { month: "2026-10", observed_amount: 0, projected_amount: 250, days_total: 31 },
    confidence: "low",
    confidence_note: "Sin snapshots históricos; no se calcula backtest.",
    inventory_source: "compras válidas menos ventas válidas (estimado)",
    no_future_replenishment: true,
    inventory_controlled_skus: 12,
    uncapped_service_skus: 2,
    insufficient_evidence_skus: 1,
  },
  daily_series: [],
  source_cutoffs: {
    sales_date: "2026-09-15",
    inventory_date: "2026-09-16",
    purchases_date: "2026-09-16",
  },
  staleness: {
    as_of_date: "2026-09-20",
    sales_days_behind: 5,
    inventory_days_behind: 4,
    purchases_days_behind: 4,
    sales_is_stale: true,
    inventory_is_stale: true,
    purchases_are_stale: true,
  },
  business_timezone: "America/Bogota",
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
        enabledFeatures: ["analisis", "forecast", "ventas-summary"],
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
    enabled_features: ["analisis", "forecast", "ventas-summary"],
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
    await expect(page.getByText(/Confianza baja según backtest/)).toContainText("75.5%");
  });
}

test("forecast-only user sees the projection but not other Analysis tabs", async ({ page }) => {
  await seedAnalysisSession(page, "masvital", ["forecast"]);

  await page.goto("/dashboards/analisis?tab=balance");

  await expect(page.getByRole("tablist", { name: "Secciones de análisis" }).getByRole("tab")).toHaveCount(1);
  await expect(page.getByRole("tab", { name: /Proyección/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: /Balance/ })).toHaveCount(0);
});

test("projection links recent invoice evaluations for users allowed to view purchases", async ({ page }) => {
  await seedAnalysisSession(page, "motoshop", ["analisis", "ventas-summary"]);
  await page.route("**/api/purchase-assessments**", (route) => route.fulfill({ json: {
    items: [{
      id: "assessment-1",
      business_date: "2026-09-05",
      cod_clase: "FC",
      num_documento: "P1",
      nit_proveedor: "900",
      nombre_proveedor: "Proveedor Norte",
      content_fingerprint: "a".repeat(64),
      assessment_fingerprint: "b".repeat(64),
      status: "completed",
      attempt_count: 1,
      last_error_code: null,
      deterministic_metrics: {
        invoice: {},
        totals: {},
        assessment_summary: {
          senal_global: "requiere_revision",
          skus_evaluados: 4,
          skus_con_evidencia_de_demanda_y_stock: 3,
          skus_sin_historial_previo_180d: 1,
          valor_lineas_compra_cop: 240,
          valor_en_senales_de_revision_cop: 180,
          porcentaje_valor_en_senales_de_revision: 75,
          limitacion: "Evaluación orientativa.",
        },
        products: [],
      },
      markdown: "## Evaluación",
      source_cutoffs: { purchases: "2026-09-13", sales: "2026-09-15", inventory: "2026-09-16", abc: "2026-09" },
      generation_mode: "llm",
      provider: "test-provider",
      model: "test-model",
      analyzer_revision: "test-v1",
      prompt_revision: "test-v1",
      created_at: "2026-09-16T12:00:00Z",
      updated_at: "2026-09-16T12:00:00Z",
      completed_at: "2026-09-16T12:00:00Z",
    }],
    date_from: "2026-09-01",
    date_to: "2026-09-15",
    limit: 10,
  } }));

  await page.goto("/dashboards/analisis?tab=proyeccion");

  await expect(page.getByRole("heading", { name: "Compras relacionadas con este horizonte" })).toBeVisible();
  const evidenceLink = page.getByRole("link", { name: /Proveedor Norte/ });
  await expect(evidenceLink).toHaveAttribute(
    "href",
    "/dashboards/compras/dia/2026-09-05/documento/P1?cod_clase=FC",
  );
  await expect(evidenceLink).toContainText("75% para revisar");
});
