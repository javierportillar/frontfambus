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
  await page.route("**/api/purchase-assessments/invoice**", (route) => route.fulfill({
    status: 404,
    json: { detail: "Assessment not generated in test fixture" },
  }));
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

async function seedLongConversationHistory(page: Page): Promise<void> {
  const conversations = Array.from({ length: 32 }, (_, index) => ({
    id: `conversation-${index}`,
    tenant_id: "motoshop",
    user_id: "admin",
    title: `Conversación ${String(index).padStart(2, "0")}`,
    status: "active",
    created_at: "2026-09-15T10:00:00Z",
    updated_at: "2026-09-15T10:00:00Z",
    last_message_at: "2026-09-15T10:00:00Z",
    message_count: 40,
  }));
  const messages = Array.from({ length: 40 }, (_, index) => ({
    id: `message-${index}`,
    conversation_id: "conversation-0",
    tenant_id: "motoshop",
    user_id: "admin",
    role: "user",
    content: `Mensaje de historial ${index}: ${"detalle de la conversación. ".repeat(5)}`,
    created_at: "2026-09-15T10:00:00Z",
  }));

  await page.route("**/api/llm/chat/conversations", (route) =>
    route.request().method() === "GET"
      ? route.fulfill({ json: conversations })
      : route.continue(),
  );
  await page.route("**/api/llm/chat/conversations/conversation-0/messages", (route) =>
    route.fulfill({ json: messages }),
  );
}

test.describe("Governed assistant cross-repository contract", () => {
  test("opens the full-page assistant from navigation and downloads an authorized report", async ({ page }) => {
    await seedSession(page);
    await page.route("**/api/reports/download/rep-1", (route) => route.fulfill({
      status: 200,
      body: "fake report",
      headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="ventas.pdf"' },
    }));

    await page.goto("/");
    await page.getByRole("link", { name: "Asistente IA" }).click();
    await expect(page).toHaveURL(/\/chat$/);
    await expect(page.getByRole("dialog", { name: "Asistente de negocio" })).toHaveCount(0);
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

  test("opens the full-page assistant from mobile navigation", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedSession(page);
    await page.goto("/");

    const assistantNav = page.getByRole("link", { name: "Asistente IA" });
    await expect(assistantNav).toBeVisible();
    await assistantNav.click();

    await expect(page).toHaveURL(/\/chat$/);
    await expect(page.getByRole("dialog", { name: "Asistente de negocio" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /(?:Buenos días|Buenas tardes|Buenas noches), Admin/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "Volver al inicio" })).toBeVisible();
    await expect(page.getByLabel("Pregunta al asistente")).toHaveCSS("font-size", "16px");
    const mobilePageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    const visibleHeight = await page.evaluate(() => window.visualViewport?.height ?? window.innerHeight);
    expect(mobilePageHeight).toBeLessThanOrEqual(visibleHeight + 1);
  });

  test("floating assistant opens a locked drawer without navigating", async ({ page }) => {
    await seedSession(page);
    await page.goto("/");

    await page.getByRole("button", { name: "Abrir asistente flotante" }).click();
    const drawer = page.getByRole("dialog", { name: "Asistente de negocio" });
    await expect(drawer).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
    await expect.poll(() => page.evaluate(() => document.body.style.position)).toBe("fixed");

    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.body.style.position)).not.toBe("fixed");
  });

  test("mobile drawer exposes history errors when no saved conversations load", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedSession(page);
    await page.route("**/api/llm/chat/conversations", (route) =>
      route.request().method() === "GET"
        ? route.fulfill({ status: 503, json: { detail: "Conversation history unavailable" } })
        : route.continue(),
    );
    await page.goto("/");
    await page.getByRole("button", { name: "Abrir asistente flotante" }).click();

    const historyButton = page.getByRole("button", { name: "Historial de conversaciones" });
    await expect(historyButton).toBeVisible();
    await historyButton.click();
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
      "No pudimos cargar tus conversaciones.",
    );
  });

  test("selecting another drawer conversation scrolls its latest messages into view", async ({ page }) => {
    const conversations = ["thread-1", "thread-2"].map((id, index) => ({
      id,
      tenant_id: "motoshop",
      user_id: "admin",
      title: `Drawer thread ${index + 1}`,
      status: "active",
      created_at: "2026-09-15T10:00:00Z",
      updated_at: "2026-09-15T10:00:00Z",
      last_message_at: "2026-09-15T10:00:00Z",
      message_count: 40,
    }));
    await seedSession(page);
    await page.route("**/api/llm/chat/conversations", (route) =>
      route.request().method() === "GET"
        ? route.fulfill({ json: conversations })
        : route.continue(),
    );
    await page.route("**/api/llm/chat/conversations/*/messages", (route) => {
      const conversationId = route.request().url().split("/").at(-2);
      const threadNumber = conversationId === "thread-1" ? 1 : 2;
      return route.fulfill({ json: Array.from({ length: 40 }, (_, index) => ({
        id: `${conversationId}-message-${index}`,
        conversation_id: conversationId,
        tenant_id: "motoshop",
        user_id: "admin",
        role: "user",
        content: `Drawer thread ${threadNumber} message ${index}`,
        created_at: "2026-09-15T10:00:00Z",
      })) });
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Abrir asistente flotante" }).click();

    const drawer = page.getByRole("dialog", { name: "Asistente de negocio" });
    const messages = drawer.getByRole("region", { name: "Mensajes de la conversación" });
    await drawer.getByRole("button", { name: "Drawer thread 1" }).click();
    await expect(messages.getByText("Drawer thread 1 message 39")).toBeVisible();
    await messages.evaluate((element) => {
      element.scrollTop = 0;
      element.dispatchEvent(new Event("scroll"));
    });
    await expect.poll(() => messages.evaluate((element) => element.scrollTop)).toBe(0);

    await drawer.getByRole("button", { name: "Drawer thread 2" }).click();
    await expect(messages.getByText("Drawer thread 2 message 39")).toBeVisible();
    await expect.poll(() => messages.evaluate((element) => (
      element.scrollHeight - element.scrollTop - element.clientHeight
    ))).toBeLessThan(80);
  });

  test("mobile drawer keeps the composer at a non-zooming text size", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedSession(page);
    await page.goto("/");

    await page.getByRole("button", { name: "Abrir asistente flotante" }).click();
    const drawer = page.getByRole("dialog", { name: "Asistente de negocio" });
    await expect(drawer).toBeVisible();
    await expect.poll(() => drawer.evaluate((dialog) => dialog.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Shift+Tab");
    expect(await drawer.evaluate((dialog) => dialog.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Tab");
    expect(await drawer.evaluate((dialog) => dialog.contains(document.activeElement))).toBe(true);
    const composer = drawer.getByLabel("Pregunta al asistente");
    await expect(composer).toHaveCSS("font-size", "16px");
    await expect(page).toHaveURL(/\/$/);
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

  test("keeps conversation history and the active thread in independent scroll areas", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedSession(page);
    await seedLongConversationHistory(page);
    await page.goto("/chat");

    const firstConversation = page.getByRole("button", { name: "Conversación 00" });
    const workspace = page.getByTestId("assistant-workspace");
    const historyScrollArea = page.getByRole("region", { name: "Conversaciones recientes" });
    const messageScrollArea = page.getByRole("region", { name: "Mensajes de la conversación" });
    await firstConversation.focus();
    await firstConversation.press("Enter");
    await expect(page.getByText(/Mensaje de historial 39:/)).toBeVisible();

    const dimensions = await workspace.evaluate((workspace) => {
      const history = workspace.querySelector('[aria-label="Conversaciones recientes"]');
      const messages = workspace.querySelector('[aria-label="Mensajes de la conversación"]');
      if (!(history instanceof HTMLElement) || !(messages instanceof HTMLElement)) {
        throw new Error("Expected independent history and message scroll areas");
      }
      return {
        viewportHeight: window.innerHeight,
        pageScrollHeight: document.documentElement.scrollHeight,
        workspaceClientHeight: workspace.clientHeight,
        workspaceScrollHeight: workspace.scrollHeight,
        historyClientHeight: history.clientHeight,
        historyScrollHeight: history.scrollHeight,
        messageClientHeight: messages.clientHeight,
        messageScrollHeight: messages.scrollHeight,
      };
    });

    expect(dimensions.workspaceClientHeight).toBeLessThanOrEqual(dimensions.viewportHeight);
    expect(dimensions.pageScrollHeight).toBeLessThanOrEqual(dimensions.viewportHeight + 1);
    expect(dimensions.workspaceScrollHeight).toBeLessThanOrEqual(dimensions.workspaceClientHeight + 1);
    expect(dimensions.historyScrollHeight).toBeGreaterThan(dimensions.historyClientHeight);
    expect(dimensions.messageScrollHeight).toBeGreaterThan(dimensions.messageClientHeight);

    await messageScrollArea.evaluate((element) => { element.scrollTop = 0; });
    const messageTopBeforeHistoryScroll = await messageScrollArea.evaluate((element) => element.scrollTop);
    await historyScrollArea.evaluate((element) => { element.scrollTop = 120; });
    const scrollPositions = await workspace.evaluate((workspace) => {
      const history = workspace.querySelector('[aria-label="Conversaciones recientes"]');
      const messages = workspace.querySelector('[aria-label="Mensajes de la conversación"]');
      return {
        historyTop: history?.scrollTop,
        messageTop: messages?.scrollTop,
        pageTop: document.documentElement.scrollTop,
      };
    });
    expect(scrollPositions.historyTop).toBeGreaterThan(0);
    expect(scrollPositions.messageTop).toBe(messageTopBeforeHistoryScroll);
    expect(scrollPositions.pageTop).toBe(0);
  });

  test("full-page assistant ignores a late history response after switching conversations", async ({ page }) => {
    const conversations = ["thread-1", "thread-2"].map((id, index) => ({
      id,
      tenant_id: "motoshop",
      user_id: "admin",
      title: `Delayed thread ${index + 1}`,
      status: "active",
      created_at: "2026-09-15T10:00:00Z",
      updated_at: "2026-09-15T10:00:00Z",
      last_message_at: "2026-09-15T10:00:00Z",
      message_count: 1,
    }));
    await seedSession(page);
    await page.route("**/api/llm/chat/conversations", (route) =>
      route.request().method() === "GET"
        ? route.fulfill({ json: conversations })
        : route.continue(),
    );
    let releaseFirstHistory!: () => void;
    let markFirstHistoryStarted!: () => void;
    const firstHistoryGate = new Promise<void>((resolve) => { releaseFirstHistory = resolve; });
    const firstHistoryStarted = new Promise<void>((resolve) => { markFirstHistoryStarted = resolve; });
    const messagesFor = (conversationId: string, content: string) => [{
      id: `${conversationId}-message`,
      conversation_id: conversationId,
      tenant_id: "motoshop",
      user_id: "admin",
      role: "user",
      content,
      created_at: "2026-09-15T10:00:00Z",
    }];
    await page.route("**/api/llm/chat/conversations/thread-1/messages", async (route) => {
      markFirstHistoryStarted();
      await firstHistoryGate;
      try {
        await route.fulfill({ json: messagesFor("thread-1", "Late message from first thread") });
      } catch {
        // The request may have been aborted when the user switched threads.
      }
    });
    await page.route("**/api/llm/chat/conversations/thread-2/messages", (route) =>
      route.fulfill({ json: messagesFor("thread-2", "Latest message in second thread") }),
    );
    await page.goto("/chat");

    const firstThread = page.getByRole("button", { name: "Delayed thread 1" });
    await firstThread.focus();
    await firstThread.press("Enter");
    await firstHistoryStarted;
    const secondThread = page.getByRole("button", { name: "Delayed thread 2" });
    await secondThread.focus();
    await secondThread.press("Enter");
    await expect(page.getByText("Latest message in second thread")).toBeVisible();
    releaseFirstHistory();
    await expect(page.getByText("Late message from first thread")).toHaveCount(0);
    await expect(page.getByText("Latest message in second thread")).toBeVisible();
  });

  test("keeps mobile conversation history scrollable without pushing the current chat away", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedSession(page);
    await seedLongConversationHistory(page);
    await page.goto("/chat");

    await page.getByRole("button", { name: "Conversaciones" }).click();
    const historyScrollArea = page.getByRole("region", { name: "Conversaciones recientes" });
    const firstConversation = historyScrollArea.getByRole("button", { name: "Conversación 00" });
    await expect(firstConversation).toBeVisible();
    const historyDimensions = await historyScrollArea.evaluate((history) => ({
      clientHeight: history.clientHeight,
      scrollHeight: history.scrollHeight,
    }));
    expect(historyDimensions.scrollHeight).toBeGreaterThan(historyDimensions.clientHeight);

    await historyScrollArea.evaluate((history) => { history.scrollTop = 0; });
    await firstConversation.focus();
    await firstConversation.press("Enter");
    await expect(page.getByText(/Mensaje de historial 39:/)).toBeVisible();

    const messageScrollArea = page.getByRole("region", { name: "Mensajes de la conversación" });
    const dimensions = await page.getByTestId("assistant-workspace").evaluate((workspace) => ({
      workspaceHeight: workspace.clientHeight,
      viewportHeight: window.innerHeight,
      documentHeight: document.documentElement.scrollHeight,
    }));
    const messageDimensions = await messageScrollArea.evaluate((messages) => ({
      clientHeight: messages.clientHeight,
      scrollHeight: messages.scrollHeight,
    }));
    expect(dimensions.workspaceHeight).toBeLessThanOrEqual(dimensions.viewportHeight);
    expect(dimensions.documentHeight).toBeLessThanOrEqual(dimensions.viewportHeight + 1);
    expect(messageDimensions.scrollHeight).toBeGreaterThan(messageDimensions.clientHeight);
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
        data_freshness: {
          sales_cutoff: "2026-09-20",
          purchase_cutoff: "2026-09-18",
          inventory_snapshot: "2026-09-20",
          snapshot_generation: 1,
          stock_source: tenant === "masvital" ? "catalog_snapshot" : "purchases_minus_sales_estimate",
        },
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
        await expect(page.getByText("Stock en catálogo")).toBeVisible();
      } else {
        await expect(page.getByText(/compradas históricas − 3 u vendidas históricas/)).toBeVisible();
        await expect(page.getByText("Stock estimado", { exact: true })).toBeVisible();
        await expect(page.getByText("Sugerencia estimada: No comprar ahora")).toBeVisible();
        await expect(page.getByRole("note")).toContainText("no confirman un conteo físico");
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
      lineas_venta: 1,
      lineas_con_costo: 1,
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

  test(`${tenant} purchase search finds providers, products, and invoice numbers`, async ({ page }) => {
    await seedSession(page, assistantReply, tenant);
    await page.route("**/api/metrics/compras-buscar*", (route) => {
      const url = new URL(route.request().url());
      const query = url.searchParams.get("q") ?? "";
      const tipo = query.toLowerCase().includes("mieli")
        ? "proveedor"
        : query.toLowerCase().includes("sku") || query.toLowerCase().includes("dulces")
          ? "producto"
          : "factura";
      return route.fulfill({ json: {
        query,
        periodo: { fecha_inicio: "2025-09-27", fecha_fin: "2026-09-27" },
        documentos: [{
          business_date: "2026-09-01",
          cod_clase: "FC",
          num_documento: "194",
          nit_proveedor: "1143934745",
          nombre_proveedor: "MIELI",
          total_factura: 32000,
          num_items: 3,
          productos_coincidentes: tipo === "producto" ? "Dulces de miel grandes" : "",
          tipo_coincidencia: tipo,
        }],
        paginacion: { page: 1, page_size: 20, total_documentos: 1, has_more: false },
      } });
    });
    await page.route("**/api/metrics/purchases-day-grouped*", (route) => route.fulfill({ json: {
      date: "2026-09-01",
      total_compras: 32000,
      total_documentos: 1,
      documentos: [{
        num_documento: "194",
        cod_clase: "FC",
        nit_proveedor: "1143934745",
        nombre_proveedor: "MIELI",
        total_factura: 32000,
        num_items: 3,
        items: [],
      }],
    } }));

    await page.goto("/dashboards/movimientos?modo=compras");
    await page.getByRole("button", { name: /Buscar/ }).click();
    const searchInput = page.getByRole("searchbox", {
      name: "Buscar proveedor, producto, SKU o número de factura",
    });
    const searchCases: Array<[string, string]> = [
      ["MIELI", "proveedor"],
      ["SKU-1", "producto"],
      ["194", "factura"],
    ];
    for (const [query, match] of searchCases) {
      await searchInput.fill(query);
      await page.getByRole("button", { name: "Buscar compras" }).click();
      await expect(page.getByText(`Coincidencia por ${match}`)).toBeVisible();
    }

    const result = page.getByRole("link", {
      name: "Abrir factura 194 clase FC de MIELI",
    });
    await expect(result).toHaveAttribute(
      "href",
      "/dashboards/compras/dia/2026-09-01/documento/194?cod_clase=FC",
    );
    await result.click();
    await expect(page).toHaveURL(/\/dashboards\/compras\/dia\/2026-09-01\/documento\/194\?cod_clase=FC$/);
    await expect(page.getByRole("heading", { name: "Detalle de la compra" })).toBeVisible();

    await page.goto("/dashboards/compras/dia/2026-09-01");
    const fullDocumentHeader = page.getByRole("link", {
      name: "Abrir factura 194 clase FC de MIELI",
    });
    await fullDocumentHeader.getByText("3 productos").click();
    await expect(page).toHaveURL(/\/dashboards\/compras\/dia\/2026-09-01\/documento\/194\?cod_clase=FC$/);
  });
}

test("assistant renders custom month rankings and links the supplier-filtered invoice exactly", async ({ page }) => {
  const productReply: TestReply = {
    ...assistantReply,
    text: [
      "### Septiembre 2026",
      "1. SKU-A · Kombucha Maracuyá · 5 UNIDAD · $37.500 COP",
      "1. SKU-B · Kombucha Lulo · 5 UNIDAD · $37.500 COP",
      "### Agosto 2026",
      "1. SKU-A · Kombucha Maracuyá · 5 UNIDAD · $37.500 COP",
    ].join("\n"),
    tools_used: ["get_top_productos_periodo"],
    entity_refs: [
      {
        entity_type: "product",
        entity_id: "SKU-A",
        label: "Kombucha Maracuyá",
        domain: "inventory",
        href: "/dashboards/productos/SKU-A",
      },
      {
        entity_type: "product",
        entity_id: "SKU-B",
        label: "Kombucha Lulo",
        domain: "inventory",
        href: "/dashboards/productos/SKU-B",
      },
    ],
    attachments: [],
  };
  const purchaseReplyWithMilis: TestReply = {
    ...assistantReply,
    text: "Top 1 de compras filtradas por MILIS · Agosto 2026\n"
      + "1. Documento: 194 · Clase: FC · Fecha: 2026-08-10 · "
      + "Proveedor: MILIS MARKET (NIT: 900444444-4) · Total: $3.000 COP",
    tools_used: ["get_top_compras_periodos"],
    entity_refs: [{
      entity_type: "purchase_document",
      entity_id: "2026-08-10|FC|194",
      label: "194",
      domain: "purchases",
      href: "/dashboards/compras/dia/2026-08-10/documento/194?cod_clase=FC",
    }],
    attachments: [],
  };
  const replenishmentReply: TestReply = {
    ...assistantReply,
    text: "Candidatos a revisar · corte inventario 2026-09-26 · ventas hasta 2026-09-26.\n"
      + "- SKU SKU-A · Kombucha Maracuyá: stock 0 UNIDAD; ventas 18 UNIDAD en 180 días; "
      + "referencia 4.5 UNIDAD para 45 días.",
    tools_used: ["get_productos_para_reponer"],
    entity_refs: [{
      entity_type: "product",
      entity_id: "SKU-A",
      label: "Kombucha Maracuyá",
      domain: "inventory",
      href: "/dashboards/productos/SKU-A",
    }],
    attachments: [],
  };
  const replies = [productReply, purchaseReplyWithMilis, replenishmentReply];
  const sentMessages: string[] = [];
  await seedSession(page, productReply);
  let replyIndex = 0;
  await page.route("**/api/llm/qa/chat", (route) => {
    const body = route.request().postDataJSON() as { message?: string };
    sentMessages.push(body.message ?? "");
    const response = replies[Math.min(replyIndex, replies.length - 1)]!;
    replyIndex += 1;
    return route.fulfill({ json: response });
  });
  await page.goto("/chat");

  await page.getByLabel("Pregunta al asistente").fill(
    "¿Cuál es el producto más vendido de septiembre y agosto?",
  );
  await page.getByRole("button", { name: "Enviar" }).click();
  const productAnswer = page.getByRole("article", {
    name: "Mensaje del asistente: Respuesta parcial",
  }).last();
  await expect(productAnswer).toContainText("Septiembre 2026");
  await expect(productAnswer).toContainText("Agosto 2026");
  const maracuyaLinks = productAnswer.getByRole("link", {
    name: "Ver ficha de Kombucha Maracuyá (SKU-A)",
  });
  await expect(maracuyaLinks).toHaveCount(2);
  await expect(maracuyaLinks.first()).toHaveAttribute("href", "/dashboards/productos/SKU-A");
  await expect(maracuyaLinks.last()).toHaveAttribute("href", "/dashboards/productos/SKU-A");
  await expect(productAnswer.getByRole("link", {
    name: "Ver ficha de Kombucha Lulo (SKU-B)",
  })).toHaveAttribute("href", "/dashboards/productos/SKU-B");

  await page.getByLabel("Pregunta al asistente").fill(
    "¿Cuál es la compra más grande hecha hacia MILIS en agosto?",
  );
  await page.getByRole("button", { name: "Enviar" }).click();
  const invoiceAnswer = page.getByRole("article", {
    name: "Mensaje del asistente: Respuesta parcial",
  }).last();
  await expect(invoiceAnswer).toContainText("MILIS MARKET");
  await expect(invoiceAnswer.getByRole("link", { name: "Ver factura 194" })).toHaveAttribute(
    "href", "/dashboards/compras/dia/2026-08-10/documento/194?cod_clase=FC",
  );

  await page.getByLabel("Pregunta al asistente").fill(
    "¿Qué productos no tengo en stock y debería enlistar para mi siguiente compra?",
  );
  await page.getByRole("button", { name: "Enviar" }).click();
  const replenishmentAnswer = page.getByRole("article", {
    name: "Mensaje del asistente: Respuesta parcial",
  }).last();
  await expect(replenishmentAnswer).toContainText("corte inventario 2026-09-26");
  await expect(replenishmentAnswer.getByRole("link", {
    name: "Ver ficha de Kombucha Maracuyá (SKU-A)",
  })).toHaveAttribute("href", "/dashboards/productos/SKU-A");
  expect(sentMessages).toEqual([
    "¿Cuál es el producto más vendido de septiembre y agosto?",
    "¿Cuál es la compra más grande hecha hacia MILIS en agosto?",
    "¿Qué productos no tengo en stock y debería enlistar para mi siguiente compra?",
  ]);
});

test("assistant lists the requested month's purchase invoices with supplier, total and exact links", async ({ page }) => {
  const invoiceRefs: TestReply["entity_refs"] = [
    {
      entity_type: "purchase_document",
      entity_id: "2026-08-10|FC|150",
      label: "150",
      domain: "purchases",
      href: "/dashboards/compras/dia/2026-08-10/documento/150?cod_clase=FC",
    },
    {
      entity_type: "purchase_document",
      entity_id: "2026-08-18|FC|151",
      label: "151",
      domain: "purchases",
      href: "/dashboards/compras/dia/2026-08-18/documento/151?cod_clase=FC",
    },
  ];
  const invoiceListReply: TestReply = {
    ...assistantReply,
    text: [
      "Compras registradas en agosto de 2026:",
      "- Documento: 150 · Clase: FC · Fecha: 2026-08-10 · Proveedor: MILIS MARKET (NIT: 900444444-4) · Total: $800 COP",
      "- Documento: 151 · Clase: FC · Fecha: 2026-08-18 · Proveedor: MIELI (NIT: 900555555-5) · Total: $400 COP",
    ].join("\n"),
    tools_used: ["get_compras_periodo"],
    entity_refs: invoiceRefs,
    attachments: [],
  };
  await seedSession(page, invoiceListReply);
  await page.route("**/api/llm/qa/chat", (route) => route.fulfill({ json: invoiceListReply }));
  await page.goto("/chat");

  await page.getByLabel("Pregunta al asistente").fill("¿Cuáles son las compras realizadas en agosto?");
  await page.getByRole("button", { name: "Enviar" }).click();
  const answer = page.getByRole("article", {
    name: "Mensaje del asistente: Respuesta parcial",
  }).last();
  await expect(answer).toContainText("MILIS MARKET");
  await expect(answer).toContainText("$800 COP");
  await expect(answer).toContainText("MIELI");
  await expect(answer).toContainText("$400 COP");
  await expect(answer.getByRole("link", { name: "Ver factura 150" })).toHaveAttribute(
    "href", invoiceRefs[0]!.href,
  );
  await expect(answer.getByRole("link", { name: "Ver factura 151" })).toHaveAttribute(
    "href", invoiceRefs[1]!.href,
  );
});

test("assistant applies exact sales periods and keeps the supplier filter on invoice rankings", async ({ page }) => {
  const productReply: TestReply = {
    ...assistantReply,
    text: [
      "### Septiembre 2026",
      "1. SKU-A · Kombucha Maracuyá · 5 UND · $37.500 COP",
      "1. SKU-B · Kombucha Lulo · 5 UND · $37.500 COP",
      "### Agosto 2026",
      "1. SKU-A · Kombucha Maracuyá · 5 UND · $37.500 COP",
    ].join("\n"),
    tools_used: ["get_top_productos_periodo"],
    entity_refs: [
      {
        entity_type: "product", entity_id: "SKU-A", label: "Kombucha Maracuyá",
        domain: "inventory", href: "/dashboards/productos/SKU-A",
      },
      {
        entity_type: "product", entity_id: "SKU-B", label: "Kombucha Lulo",
        domain: "inventory", href: "/dashboards/productos/SKU-B",
      },
    ],
    attachments: [],
  };
  const purchaseReply: TestReply = {
    ...assistantReply,
    text: "Agosto 2026 · proveedor MILIS\n1. Documento: 194 · Clase: FC · Fecha: 2026-08-10 · Total: $3.000 COP",
    tools_used: ["get_top_compras_periodos"],
    entity_refs: [{
      entity_type: "purchase_document",
      entity_id: "2026-08-10|FC|194",
      label: "194",
      domain: "purchases",
      href: "/dashboards/compras/dia/2026-08-10/documento/194?cod_clase=FC",
    }],
    attachments: [],
  };
  const replies = [productReply, purchaseReply];
  await seedSession(page, productReply);
  const sentMessages: string[] = [];
  let replyIndex = 0;
  await page.route("**/api/llm/qa/chat", (route) => {
    const body = route.request().postDataJSON() as { message?: string };
    sentMessages.push(body.message ?? "");
    const reply = replies[Math.min(replyIndex, replies.length - 1)]!;
    replyIndex += 1;
    return route.fulfill({ json: reply });
  });
  await page.goto("/chat");

  await page.getByLabel("Pregunta al asistente").fill(
    "¿Cuál es el producto más vendido de septiembre y agosto?",
  );
  await page.getByRole("button", { name: "Enviar" }).click();
  const salesAnswer = page.getByRole("article", {
    name: "Mensaje del asistente: Respuesta parcial",
  }).last();
  await expect(salesAnswer).toContainText("Septiembre 2026");
  await expect(salesAnswer).toContainText("Agosto 2026");
  const maracuyaLinks = salesAnswer.getByRole("link", {
    name: "Ver ficha de Kombucha Maracuyá (SKU-A)",
  });
  await expect(maracuyaLinks).toHaveCount(2);
  await expect(maracuyaLinks.first()).toHaveAttribute("href", "/dashboards/productos/SKU-A");
  await expect(maracuyaLinks.last()).toHaveAttribute("href", "/dashboards/productos/SKU-A");
  await expect(salesAnswer.getByRole("link", { name: "Ver ficha de Kombucha Lulo (SKU-B)" })).toHaveAttribute(
    "href", "/dashboards/productos/SKU-B",
  );

  await page.getByLabel("Pregunta al asistente").fill(
    "¿Cuál es la compra más grande hecha hacia MILIS en agosto?",
  );
  await page.getByRole("button", { name: "Enviar" }).click();
  const purchaseAnswer = page.getByRole("article", {
    name: "Mensaje del asistente: Respuesta parcial",
  }).last();
  await expect(purchaseAnswer).toContainText("MILIS");
  await expect(purchaseAnswer.getByRole("link", { name: "Ver factura 194" })).toHaveAttribute(
    "href", "/dashboards/compras/dia/2026-08-10/documento/194?cod_clase=FC",
  );
  expect(sentMessages).toEqual([
    "¿Cuál es el producto más vendido de septiembre y agosto?",
    "¿Cuál es la compra más grande hecha hacia MILIS en agosto?",
  ]);
});

test("assistant lists ABC-A catalog products with stock, action, and a next-page follow-up", async ({ page }) => {
  const pageReplies: TestReply[] = [
    {
      ...assistantReply,
      text: "Catálogo ABC A · últimos 180 días · página 1/2 · 51 productos en total.\n"
        + "- SKU MINI-01 · Mini Brownie: stock 5; vendido 14 u; 64 días; acción no comprar ahora.\n"
        + "- SKU MINI-02 · Mini Cake: stock 0; vendido 8 u; agotado; acción reabastecer.",
      tools_used: ["get_productos_catalogo"],
      entity_refs: [
        {
          entity_type: "product", entity_id: "MINI-01", label: "Mini Brownie",
          domain: "inventory", href: "/dashboards/productos/MINI-01",
        },
        {
          entity_type: "product", entity_id: "MINI-02", label: "Mini Cake",
          domain: "inventory", href: "/dashboards/productos/MINI-02",
        },
      ],
      attachments: [],
    },
    {
      ...assistantReply,
      text: "Catálogo ABC A · últimos 180 días · página 2/2 · 51 productos en total.\n"
        + "- SKU MINI-03 · Granola Mini: stock 7; vendido 12 u; 105 días; sobrestock; acción liquidar.",
      tools_used: ["get_productos_catalogo"],
      entity_refs: [{
        entity_type: "product", entity_id: "MINI-03", label: "Granola Mini",
        domain: "inventory", href: "/dashboards/productos/MINI-03",
      }],
      attachments: [],
    },
  ];
  const sentMessages: string[] = [];
  let replyIndex = 0;
  await seedSession(page, pageReplies[0]!);
  await page.route("**/api/llm/qa/chat", (route) => {
    const body = route.request().postDataJSON() as { message?: string };
    sentMessages.push(body.message ?? "");
    const reply = pageReplies[Math.min(replyIndex, pageReplies.length - 1)]!;
    replyIndex += 1;
    return route.fulfill({ json: reply });
  });
  await page.goto("/chat");

  await page.getByLabel("Pregunta al asistente").fill(
    "Lista los productos de categoría A con stock y acción",
  );
  await page.getByRole("button", { name: "Enviar" }).click();
  const firstAnswer = page.getByRole("article", {
    name: "Mensaje del asistente: Respuesta parcial",
  }).last();
  await expect(firstAnswer).toContainText("51 productos en total");
  await expect(firstAnswer).toContainText("acción no comprar ahora");
  await expect(firstAnswer.getByRole("link", {
    name: "Ver ficha de Mini Brownie (MINI-01)",
  })).toHaveAttribute("href", "/dashboards/productos/MINI-01");

  await page.getByLabel("Pregunta al asistente").fill("Siguiente página");
  await page.getByRole("button", { name: "Enviar" }).click();
  const nextAnswer = page.getByRole("article", {
    name: "Mensaje del asistente: Respuesta parcial",
  }).last();
  await expect(nextAnswer).toContainText("página 2/2");
  await expect(nextAnswer).toContainText("acción liquidar");
  expect(sentMessages).toEqual([
    "Lista los productos de categoría A con stock y acción",
    "Siguiente página",
  ]);
});
