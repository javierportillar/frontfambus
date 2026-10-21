import { describe, it, expect } from "vitest";
import {
  sanitizeBancolombiaReference,
  parseBancolombiaQRText,
} from "./bancolombia";

describe("Bancolombia QR & Reference Utilities", () => {
  describe("sanitizeBancolombiaReference", () => {
    it("strips trailing 'null' with space", () => {
      expect(sanitizeBancolombiaReference("0092055984 null")).toBe("0092055984");
    });

    it("strips trailing 'null' without space", () => {
      expect(sanitizeBancolombiaReference("0092055984null")).toBe("0092055984");
    });

    it("leaves clean reference intact", () => {
      expect(sanitizeBancolombiaReference("0092055984")).toBe("0092055984");
    });

    it("handles empty or whitespace strings", () => {
      expect(sanitizeBancolombiaReference("")).toBe("");
      expect(sanitizeBancolombiaReference("   ")).toBe("");
    });
  });

  describe("parseBancolombiaQRText", () => {
    it("extracts customer name and strips null from reference in full movement row", () => {
      const input = "21/10/2026 PAGO QR JUAN CARLOS PEREZ 0092055984 null $ 45.000";
      const result = parseBancolombiaQRText(input);

      expect(result.rawMatched).toBe(true);
      expect(result.customerName).toBe("JUAN CARLOS PEREZ");
      expect(result.reference).toBe("0092055984");
      expect(result.amount).toBe(45000);
    });

    it("extracts name when only description is provided", () => {
      const input = "PAGO QR MARIA EUGENIA GOMEZ";
      const result = parseBancolombiaQRText(input);

      expect(result.rawMatched).toBe(true);
      expect(result.customerName).toBe("MARIA EUGENIA GOMEZ");
      expect(result.reference).toBeUndefined();
    });

    it("extracts reference and strips null when only reference column is provided", () => {
      const input = "0092055984 null";
      const result = parseBancolombiaQRText(input);

      expect(result.rawMatched).toBe(true);
      expect(result.customerName).toBeUndefined();
      expect(result.reference).toBe("0092055984");
    });

    it("extracts name and reference from tab-separated movement row", () => {
      const input = "21/10/2026\tPAGO QR ANDRES FELIPE RUIZ\t004819201 null\t$ 120.000";
      const result = parseBancolombiaQRText(input);

      expect(result.rawMatched).toBe(true);
      expect(result.customerName).toBe("ANDRES FELIPE RUIZ");
      expect(result.reference).toBe("004819201");
      expect(result.amount).toBe(120000);
    });

    it("handles empty input gracefully", () => {
      const result = parseBancolombiaQRText("");
      expect(result.rawMatched).toBe(false);
      expect(result.customerName).toBeUndefined();
      expect(result.reference).toBeUndefined();
    });
  });
});
