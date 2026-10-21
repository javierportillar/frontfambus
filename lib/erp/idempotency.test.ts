import { describe, expect, it } from "vitest";
import {
  generateIdempotencyKey,
  generateRequestId,
  generateUuidV4,
  isValidIdempotencyKey,
} from "./idempotency";

describe("generateIdempotencyKey", () => {
  it("genera un UUID v4 aceptado por el backend", () => {
    const key = generateIdempotencyKey();
    expect(isValidIdempotencyKey(key)).toBe(true);
    expect(key).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("genera claves distintas en cada llamada", () => {
    const keys = new Set(
      Array.from({ length: 200 }, () => generateIdempotencyKey()),
    );
    expect(keys.size).toBe(200);
  });

  it("respeta la versión 4 y la variante RFC 4122", () => {
    for (let i = 0; i < 50; i += 1) {
      const parts = generateUuidV4().split("-");
      expect(parts[2]?.[0]).toBe("4");
      expect(["8", "9", "a", "b"]).toContain(parts[3]?.[0]);
    }
  });
});

describe("generateRequestId", () => {
  it("genera un UUID v4 para correlación", () => {
    expect(isValidIdempotencyKey(generateRequestId())).toBe(true);
  });
});

describe("isValidIdempotencyKey", () => {
  it("rechaza valores que no son UUID v4", () => {
    expect(isValidIdempotencyKey("")).toBe(false);
    expect(isValidIdempotencyKey("no-es-uuid")).toBe(false);
    // UUID v1: versión equivocada.
    expect(
      isValidIdempotencyKey("0f8fad5b-d9cb-1eea-b9c5-9473c92f9c1a"),
    ).toBe(false);
    // Variante inválida (la regex exige 8, 9, a o b).
    expect(
      isValidIdempotencyKey("0f8fad5b-d9cb-4eea-c9c5-9473c92f9c1a"),
    ).toBe(false);
    // Caracteres fuera del rango hexadecimal.
    expect(
      isValidIdempotencyKey("0f8fad5b-d9cb-4eea-b9c5-9473c92f9c1z"),
    ).toBe(false);
  });

  it("acepta un UUID v4 en mayúsculas", () => {
    expect(
      isValidIdempotencyKey("0F8FAD5B-D9CB-4EEA-B9C5-9473C92F9C1A"),
    ).toBe(true);
  });
});
