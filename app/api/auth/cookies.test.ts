// @vitest-environment node

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * La cookie del access token tiene que durar lo mismo que el refresh.
 *
 * El middleware sólo comprueba que la cookie exista: si muere a los 15 minutos
 * (la vigencia del JWT), la siguiente navegación —o el prefetch que dispara el
 * hover del menú lateral— redirige a /login aunque el refresh token siga vivo.
 */
function maxAgeDeToken(ruta: string): number {
  const fuente = readFileSync(ruta, "utf8");
  const bloque = fuente.slice(
    fuente.indexOf('cookies.set("motoshop_token"'),
    fuente.indexOf("});", fuente.indexOf('cookies.set("motoshop_token"')),
  );
  const match = /maxAge:\s*([^,\n]+)/.exec(bloque);
  if (!match) throw new Error(`sin maxAge en ${ruta}`);
  return Number(new Function(`return (${match[1]})`)());
}

const SIETE_DIAS = 7 * 24 * 60 * 60;

describe("cookies de sesión", () => {
  it("el access token del login dura 7 días, no 15 minutos", () => {
    expect(maxAgeDeToken("app/api/auth/login/route.ts")).toBe(SIETE_DIAS);
  });

  it("el refresh reescribe la cookie con la misma vigencia", () => {
    expect(maxAgeDeToken("app/api/auth/refresh/route.ts")).toBe(SIETE_DIAS);
  });
});
