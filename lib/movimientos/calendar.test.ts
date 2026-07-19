import { describe, expect, it } from "vitest";
import { calendarCopy, calendarDayAriaLabel, calendarMetricTitle } from "./calendar";

describe("shared movement calendar terminology", () => {
  it("describes sales with net sales, invoices and ticket terminology", () => {
    expect(calendarDayAriaLabel("sales", 18, "07", "$ 250.000", 2)).toBe(
      "18 de 07: $ 250.000 en ventas netas, 2 facturas",
    );
    expect(calendarMetricTitle("sales", "$ 250.000", 1, "$ 250.000")).toContain(
      "1 factura · ticket",
    );
  });

  it("describes purchases without announcing sales or invoices", () => {
    const description = [
      calendarDayAriaLabel("purchases", 18, "07", "$ 250.000", 2),
      calendarMetricTitle("purchases", "$ 250.000", 2, "$ 125.000"),
      ...Object.values(calendarCopy("purchases")),
    ].join(" ");

    expect(description).toContain("en compras");
    expect(description).toContain("2 documentos");
    expect(description).not.toMatch(/ventas|facturas|ticket/i);
  });
});
