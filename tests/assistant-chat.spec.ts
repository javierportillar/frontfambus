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
  entity_refs: Array<Record<string, string>>;
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
    href: "/inventario/productos/SKU-1",
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

async function seedSession(page: Page, reply = assistantReply) {
  await page.context().addCookies([
    { name: "motoshop_token", value: "test-token", domain: "localhost", path: "/" },
    { name: "motoshop_tenant", value: "motoshop", domain: "localhost", path: "/" },
  ]);
  await page.addInitScript((state) => {
    window.localStorage.setItem("motoshop_auth", state);
  }, persistedState());

  await page.route("**/api/auth/me", (route: Route) => {
    const tenant = route.request().headers()["x-tenant"] ?? "motoshop";
    return route.fulfill({ json: {
      username: "admin",
      role: "admin",
      tenants_allowed: ["motoshop", "masvital"],
      current_tenant: tenant,
      enabled_features: ["chat-ia", "ventas-summary", "inventario", "alerts", "dormidos", "abc", "analisis", "forecast"],
      allowed_modules: null,
    } });
  });
  await page.route("**/api/auth/refresh", (route) => route.fulfill({ status: 204 }));
  await page.route("**/api/llm/qa/chat", (route: Route) => route.fulfill({ json: reply }));
  await page.route("**/api/llm/chat/conversations", (route: Route) => {
    if (route.request().method() === "POST") return route.fulfill({ json: {
      id: "conversation-1", tenant_id: "motoshop", user_id: "admin", title: "Ventas de septiembre",
      status: "active", created_at: "2026-09-15T10:00:00Z", updated_at: "2026-09-15T10:00:00Z",
      last_message_at: "2026-09-15T10:00:00Z", message_count: 2,
    } });
    return route.fulfill({ json: [{
      id: "conversation-1", tenant_id: "motoshop", user_id: "admin", title: "Ventas de septiembre",
      status: "active", created_at: "2026-09-15T10:00:00Z", updated_at: "2026-09-15T10:00:00Z",
      last_message_at: "2026-09-15T10:00:00Z", message_count: 2,
    }] });
  });
  await page.route("**/api/llm/chat/conversations/*/messages", (route: Route) => route.fulfill({ json: [
    { id: "user-1", conversation_id: "conversation-1", tenant_id: "motoshop", user_id: "admin", role: "user", content: "ventas", created_at: "2026-09-15T10:00:00Z" },
    { id: "assistant-1", user_id: "admin", role: "assistant", content: reply.text, created_at: "2026-09-15T10:00:01Z", ...reply },
  ] }));
}

test.describe("Governed assistant cross-repository contract", () => {
  test("keeps drawer and full page parity and downloads an authorized report", async ({ page }) => {
    await seedSession(page);
    await page.route("**/api/reports/download/rep-1", (route) => route.fulfill({
      status: 200,
      body: "fake report",
      headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="ventas.pdf"' },
    }));

    await page.goto("/chat");
    await page.getByLabel("Pregunta al asistente").fill("¿Cómo están las ventas?");
    await page.getByRole("button", { name: "Enviar" }).click();
    const fullPageMessage = page.getByRole("article", { name: "Mensaje del asistente: Respuesta parcial" });
    await expect(fullPageMessage).toContainText("Ventas disponibles.");
    await expect(fullPageMessage).toContainText("Ventas del corte");
    await expect(fullPageMessage).toContainText("sales: current");
    await expect(fullPageMessage.getByRole("link", { name: "Filtro" })).toHaveAttribute("href", "/inventario/productos/SKU-1");

    const downloadPromise = page.waitForEvent("download");
    await fullPageMessage.getByRole("link", { name: "Descargar PDF" }).click();
    expect((await downloadPromise).suggestedFilename()).toBe("ventas.pdf");

    await page.getByRole("button", { name: "Abrir asistente de negocio" }).click();
    const drawer = page.getByRole("dialog", { name: "Asistente de negocio" });
    await drawer.getByRole("button", { name: "Ventas de septiembre" }).click();
    const drawerMessage = drawer.getByRole("article", { name: "Mensaje del asistente: Respuesta parcial" });
    await expect(drawerMessage).toContainText("Ventas disponibles.");
    await expect(drawerMessage).toContainText("Ventas del corte");
    await expect(drawerMessage).toContainText("sales: current");
    await expect(drawerMessage.getByRole("link", { name: "Filtro" })).toHaveAttribute("href", "/inventario/productos/SKU-1");
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
    await expect(page.getByText("Preguntale al asistente sobre el negocio.")).toBeVisible();
    await expect(page.getByText("El reporte anterior expiró.")).toHaveCount(0);
  });
});
