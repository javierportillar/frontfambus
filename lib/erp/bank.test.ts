import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api/client";
import { ErpApiError } from "./errors";
import {
  BANK_SKIP_NODE_HEADER,
  BankNodeError,
  clearBankNodeAffinity,
  createBankVerification,
  formatBankValor,
  getBankVerification,
  listBankCandidates,
} from "./bank";

vi.mock("@/lib/api/client", () => ({ apiFetch: vi.fn() }));

const mockedFetch = vi.mocked(apiFetch);

/** Respuesta mínima con la forma que consume `lib/erp/bank.ts`. */
function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    json: async () => body,
  } as unknown as Response;
}

/** Respuesta sin body legible: `json()` rechaza, como un 404 vacío. */
function bodylessResponse(status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => {
      throw new Error("sin body");
    },
  } as unknown as Response;
}

function requestHeaders(init: RequestInit | undefined): Record<string, string> {
  return (init?.headers ?? {}) as Record<string, string>;
}

beforeEach(() => {
  mockedFetch.mockReset();
  clearBankNodeAffinity();
});

describe("cliente de verificación bancaria", () => {
  it("test_crear_verificacion_devuelve_job_id_y_expira_en", async () => {
    const expiraEn = new Date(Date.now() + 300_000).toISOString();
    mockedFetch.mockResolvedValueOnce(
      jsonResponse(202, {
        job_id: "9f1c2a44-7c0e-4d3a-9c2e-5b6a1d0f3c21",
        estado: "en_cola",
        expira_en: expiraEn,
      }),
    );

    const job = await createBankVerification({
      facturaId: "FVP-100",
      valor: 458200,
    });

    expect(job.job_id).toBe("9f1c2a44-7c0e-4d3a-9c2e-5b6a1d0f3c21");
    expect(job.estado).toBe("en_cola");
    expect(job.expira_en).toBe(expiraEn);

    expect(mockedFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockedFetch.mock.calls[0] ?? [];
    expect(url).toBe("/api/erp/bank/verificaciones");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(
      JSON.stringify({ factura_id: "FVP-100", valor: "458200.00" }),
    );
  });

  it("test_crear_verificacion_en_modo_pago_envia_nitter_y_nombre_sin_factura_id", async () => {
    mockedFetch.mockResolvedValueOnce(
      jsonResponse(202, {
        job_id: "job-pago",
        estado: "en_cola",
        expira_en: new Date(Date.now() + 300_000).toISOString(),
      }),
    );

    await createBankVerification({
      valor: 115000,
      nitter: "900123456",
      nombreEsperado: "VALERIA CASTRILLON",
    });

    const [, init] = mockedFetch.mock.calls[0] ?? [];
    const body = JSON.parse(String(init?.body));
    expect(body).toEqual({
      modo: "pago",
      valor: "115000.00",
      nitter: "900123456",
      nombre_esperado: "VALERIA CASTRILLON",
    });
    expect(body).not.toHaveProperty("factura_id");
  });

  it("test_crear_verificacion_en_modo_pago_omite_señales_ausentes", async () => {
    mockedFetch.mockResolvedValueOnce(
      jsonResponse(202, {
        job_id: "job-pago-sin-señales",
        estado: "en_cola",
        expira_en: new Date(Date.now() + 300_000).toISOString(),
      }),
    );

    await createBankVerification({ valor: "115000.00" });

    const [, init] = mockedFetch.mock.calls[0] ?? [];
    expect(JSON.parse(String(init?.body))).toEqual({
      modo: "pago",
      valor: "115000.00",
    });
  });

  it("test_consultar_estado_del_job_por_job_id", async () => {
    mockedFetch.mockResolvedValueOnce(
      jsonResponse(200, {
        job_id: "job-1",
        estado: "resuelto",
        expira_en: "2026-10-21T12:05:00",
        resultado: {
          ventana: { desde: "2026-10-21", hasta: "2026-10-21" },
          nodo: "nodo-motoshop",
          ingesta_at: "2026-10-21T12:00:00",
          cuenta: "ETIQUETA",
          paginas: 2,
          movimientos: 7,
          candidatos: 1,
          candidato: {
            id: "cand-1",
            valor: "458200.00",
            pagador_nombre: "CRISTOPHER BENAMIDES P",
            referencia: "0092055984",
            fecha: "2026-10-21",
          },
        },
      }),
    );

    const job = await getBankVerification("job-1");

    expect(job.job_id).toBe("job-1");
    expect(job.estado).toBe("resuelto");
    if (job.estado !== "resuelto") throw new Error("el job no quedó resuelto");
    expect(job.resultado?.candidato?.pagadorNombre).toBe(
      "CRISTOPHER BENAMIDES P",
    );
    expect(job.resultado?.candidato?.referencia).toBe("0092055984");

    const [url, init] = mockedFetch.mock.calls[0] ?? [];
    expect(url).toBe("/api/erp/bank/verificaciones/job-1");
    expect(init?.method).toBe("GET");
  });

  it("test_el_candidato_trae_nitter_y_cliente_nombre_cuando_existen", async () => {
    mockedFetch.mockResolvedValueOnce(
      jsonResponse(200, {
        job_id: "job-cliente",
        estado: "resuelto",
        expira_en: new Date(Date.now() + 300_000).toISOString(),
        resultado: {
          ventana: { desde: "2026-10-22", hasta: "2026-10-22" },
          movimientos: 6,
          candidato: {
            id: "cand-1",
            valor: "476000.00",
            pagador_nombre: "CRISTOPHER BENAMIDES P",
            referencia: "0092055984",
            fecha: "2026-10-22",
            nitter: "900123456-7",
            cliente_nombre: "Ferretería El Tornillo",
          },
        },
      }),
    );

    const job = await getBankVerification("job-cliente");

    if (job.estado !== "resuelto") throw new Error("el job no quedó resuelto");
    expect(job.resultado?.candidato?.nitter).toBe("900123456-7");
    expect(job.resultado?.candidato?.clienteNombre).toBe(
      "Ferretería El Tornillo",
    );
  });

  it("test_el_candidato_no_inventa_nitter_ni_cliente_si_faltan", async () => {
    mockedFetch.mockResolvedValueOnce(
      jsonResponse(200, {
        job_id: "job-sin-cliente",
        estado: "resuelto",
        expira_en: new Date(Date.now() + 300_000).toISOString(),
        resultado: {
          ventana: { desde: "2026-10-22", hasta: "2026-10-22" },
          movimientos: 6,
          candidato: {
            id: "cand-1",
            valor: "476000.00",
            pagador_nombre: "CRISTOPHER BENAMIDES P",
            referencia: "0092055984",
            fecha: "2026-10-22",
          },
        },
      }),
    );

    const job = await getBankVerification("job-sin-cliente");

    if (job.estado !== "resuelto") throw new Error("el job no quedó resuelto");
    expect(job.resultado?.candidato?.nitter).toBeUndefined();
    expect(job.resultado?.candidato?.clienteNombre).toBeUndefined();
  });

  it("test_503_scraper_no_habilitado_se_traduce_a_error_de_nodo_no_a_excepcion_generica", async () => {
    mockedFetch.mockResolvedValueOnce(
      jsonResponse(503, {
        detail: {
          error_codigo: "scraper_no_habilitado",
          message:
            "Este nodo no tiene el scraper del banco habilitado: la verificación se hace desde el nodo local del tenant.",
        },
      }),
    );

    const error = await createBankVerification({
      facturaId: "FVP-100",
      valor: "458200.00",
    }).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(BankNodeError);
    expect(error).not.toBeInstanceOf(ErpApiError);
    expect((error as BankNodeError).error_codigo).toBe("scraper_no_habilitado");
    expect((error as BankNodeError).status).toBe(503);
    expect((error as BankNodeError).message).toContain("nodo local del tenant");
  });

  it("test_503_tenant_no_servido_se_traduce_a_error_de_nodo", async () => {
    mockedFetch.mockResolvedValueOnce(
      jsonResponse(503, {
        detail: {
          error_codigo: "tenant_no_servido",
          message: "Este nodo sirve al tenant 'motoshop', no al 'masvital'.",
        },
      }),
    );

    const error = await getBankVerification("job-1").catch(
      (err: unknown) => err,
    );

    expect(error).toBeInstanceOf(BankNodeError);
    expect((error as BankNodeError).error_codigo).toBe("tenant_no_servido");
  });

  it("test_job_vencido_se_traduce_a_estado_expirado", async () => {
    const vencido = new Date(Date.now() - 60_000).toISOString();
    mockedFetch.mockResolvedValueOnce(
      jsonResponse(200, {
        job_id: "job-vencido",
        estado: "ejecutando",
        expira_en: vencido,
      }),
    );

    const job = await getBankVerification("job-vencido");

    expect(job.estado).toBe("expirado");
  });

  it("test_consultar_candidatos_por_valor_devuelve_ambiguo_y_candidatos", async () => {
    mockedFetch.mockResolvedValueOnce(
      jsonResponse(200, {
        ambiguo: true,
        ventana: { desde: "2026-10-21", hasta: "2026-10-21" },
        candidatos: [
          {
            id: "cand-1",
            valor: "458200.00",
            pagadorNombre: "CRISTOPHER BENAMIDES P",
            referencia: "0092055984",
            fecha: "2026-10-21",
          },
          {
            id: "cand-2",
            valor: "458200.00",
            pagadorNombre: "ANOTHER PAYER",
            referencia: "0092055999",
            fecha: "2026-10-21",
          },
        ],
        ultimaIngestaAt: "2026-10-21T12:00:00",
      }),
    );

    const resultado = await listBankCandidates({ valor: 458200 });

    expect(resultado.ambiguo).toBe(true);
    expect(resultado.candidatos).toHaveLength(2);
    expect(resultado.candidatos[0]?.pagadorNombre).toBe(
      "CRISTOPHER BENAMIDES P",
    );
    expect(resultado.candidatos[1]?.referencia).toBe("0092055999");
    expect(resultado.ventana).toEqual({
      desde: "2026-10-21",
      hasta: "2026-10-21",
    });
    expect(resultado.ultimaIngestaAt).toBe("2026-10-21T12:00:00");

    const [url] = mockedFetch.mock.calls[0] ?? [];
    expect(url).toBe("/api/erp/bank/candidates?valor=458200.00");
  });

  it("test_sin_candidatos_devuelve_lista_vacia_y_no_es_error", async () => {
    mockedFetch.mockResolvedValueOnce(
      jsonResponse(200, {
        ambiguo: false,
        ventana: { desde: "2026-10-21", hasta: "2026-10-21" },
        candidatos: [],
        ultimaIngestaAt: null,
      }),
    );

    const resultado = await listBankCandidates({ valor: "458200.00" });

    expect(resultado.ambiguo).toBe(false);
    expect(resultado.candidatos).toEqual([]);
    expect(resultado.ultimaIngestaAt).toBeNull();
  });

  it("test_el_valor_siempre_viaja_como_texto_con_dos_decimales", () => {
    expect(formatBankValor(458200)).toBe("458200.00");
    expect(formatBankValor("458200")).toBe("458200.00");
    expect(formatBankValor("458200.5")).toBe("458200.50");
    expect(formatBankValor("458200.00")).toBe("458200.00");
  });

  it("test_un_job_vigente_conserva_su_estado", async () => {
    mockedFetch.mockResolvedValueOnce(
      jsonResponse(200, {
        job_id: "job-vivo",
        estado: "ejecutando",
        expira_en: new Date(Date.now() + 120_000).toISOString(),
      }),
    );

    const job = await getBankVerification("job-vivo");

    expect(job.estado).toBe("ejecutando");
  });

  it("test_el_post_captura_el_nodo_del_body_y_lo_manda_en_cada_sondeo", async () => {
    mockedFetch.mockResolvedValueOnce(
      jsonResponse(202, {
        job_id: "job-pin-body",
        estado: "en_cola",
        expira_en: new Date(Date.now() + 300_000).toISOString(),
        nodo: "motoshop-local",
      }),
    );
    mockedFetch.mockResolvedValueOnce(
      jsonResponse(
        200,
        {
          job_id: "job-pin-body",
          estado: "ejecutando",
          expira_en: new Date(Date.now() + 300_000).toISOString(),
        },
        { "X-Bank-Node": "motoshop-local" },
      ),
    );

    await createBankVerification({ valor: 100_000 });
    await getBankVerification("job-pin-body");

    const [, pollInit] = mockedFetch.mock.calls[1] ?? [];
    expect(requestHeaders(pollInit)["X-Bank-Node"]).toBe("motoshop-local");
  });

  it("test_el_post_captura_el_nodo_desde_el_header_si_el_body_no_lo_trae", async () => {
    mockedFetch.mockResolvedValueOnce(
      jsonResponse(
        202,
        {
          job_id: "job-pin-header",
          estado: "en_cola",
          expira_en: new Date(Date.now() + 300_000).toISOString(),
        },
        { "X-Bank-Node": "masvital-local" },
      ),
    );
    mockedFetch.mockResolvedValueOnce(
      jsonResponse(200, {
        job_id: "job-pin-header",
        estado: "ejecutando",
        expira_en: new Date(Date.now() + 300_000).toISOString(),
      }),
    );

    await createBankVerification({ valor: 100_000 });
    await getBankVerification("job-pin-header");

    const [, pollInit] = mockedFetch.mock.calls[1] ?? [];
    expect(requestHeaders(pollInit)["X-Bank-Node"]).toBe("masvital-local");
  });

  it("test_job_no_encontrado_reintenta_tres_veces_el_nodo_fijado_y_despues_falla", async () => {
    const jobNotFoundBody = {
      detail: {
        error_codigo: "job_no_encontrado",
        message: "El job todavía no está disponible en este nodo.",
      },
    };
    mockedFetch.mockResolvedValueOnce(
      jsonResponse(202, {
        job_id: "job-perdido",
        estado: "en_cola",
        expira_en: new Date(Date.now() + 300_000).toISOString(),
        nodo: "motoshop-local",
      }),
    );
    mockedFetch.mockResolvedValueOnce(jsonResponse(404, jobNotFoundBody));
    mockedFetch.mockResolvedValueOnce(jsonResponse(404, jobNotFoundBody));
    mockedFetch.mockResolvedValueOnce(jsonResponse(404, jobNotFoundBody));
    mockedFetch.mockResolvedValueOnce(jsonResponse(404, jobNotFoundBody));

    await createBankVerification({ valor: 100_000 });
    const error = await getBankVerification("job-perdido").catch(
      (err: unknown) => err,
    );

    expect(error).toBeInstanceOf(ErpApiError);
    expect((error as ErpApiError).status).toBe(404);
    expect((error as ErpApiError).code).toBe("job_no_encontrado");
    expect(mockedFetch).toHaveBeenCalledTimes(5);

    const polls = mockedFetch.mock.calls.slice(1);
    for (const [, init] of polls.slice(0, 3)) {
      expect(requestHeaders(init)["X-Bank-Node"]).toBe("motoshop-local");
    }
    const [, fallbackInit] = polls[3] ?? [];
    expect(requestHeaders(fallbackInit)["X-Bank-Node"]).toBeUndefined();
    expect(requestHeaders(fallbackInit)[BANK_SKIP_NODE_HEADER]).toBe(
      "motoshop-local",
    );
  });

  it("test_nodo_fijado_con_502_hace_un_solo_fallback_a_un_nodo_distinto", async () => {
    mockedFetch.mockResolvedValueOnce(
      jsonResponse(202, {
        job_id: "job-502",
        estado: "en_cola",
        expira_en: new Date(Date.now() + 300_000).toISOString(),
        nodo: "motoshop-local",
      }),
    );
    mockedFetch.mockResolvedValueOnce(
      jsonResponse(502, { detail: "bad gateway" }),
    );
    mockedFetch.mockResolvedValueOnce(
      jsonResponse(
        200,
        {
          job_id: "job-502",
          estado: "ejecutando",
          expira_en: new Date(Date.now() + 300_000).toISOString(),
        },
        { "X-Bank-Node": "primary" },
      ),
    );

    await createBankVerification({ valor: 100_000 });
    const job = await getBankVerification("job-502");

    expect(job.estado).toBe("ejecutando");
    expect(mockedFetch).toHaveBeenCalledTimes(3);

    const polls = mockedFetch.mock.calls.slice(1);
    expect(polls).toHaveLength(2);
    expect(requestHeaders(polls[0]?.[1])["X-Bank-Node"]).toBe("motoshop-local");
    expect(requestHeaders(polls[1]?.[1])["X-Bank-Node"]).toBeUndefined();
    expect(requestHeaders(polls[1]?.[1])[BANK_SKIP_NODE_HEADER]).toBe(
      "motoshop-local",
    );
  });

  it("test_nodo_fijado_con_error_de_red_hace_el_mismo_fallback", async () => {
    mockedFetch.mockResolvedValueOnce(
      jsonResponse(202, {
        job_id: "job-red",
        estado: "en_cola",
        expira_en: new Date(Date.now() + 300_000).toISOString(),
        nodo: "masvital-local",
      }),
    );
    mockedFetch.mockRejectedValueOnce(new Error("fetch failed"));
    mockedFetch.mockResolvedValueOnce(
      jsonResponse(
        200,
        {
          job_id: "job-red",
          estado: "ejecutando",
          expira_en: new Date(Date.now() + 300_000).toISOString(),
        },
        { "X-Bank-Node": "primary" },
      ),
    );

    await createBankVerification({ valor: 100_000 });
    const job = await getBankVerification("job-red");

    expect(job.estado).toBe("ejecutando");
    expect(mockedFetch).toHaveBeenCalledTimes(3);

    const polls = mockedFetch.mock.calls.slice(1);
    expect(polls).toHaveLength(2);
    expect(requestHeaders(polls[0]?.[1])["X-Bank-Node"]).toBe("masvital-local");
    expect(requestHeaders(polls[1]?.[1])["X-Bank-Node"]).toBeUndefined();
    expect(requestHeaders(polls[1]?.[1])[BANK_SKIP_NODE_HEADER]).toBe(
      "masvital-local",
    );
  });

  it("test_404_con_otro_error_codigo_no_reintenta_ni_hace_fallback", async () => {
    mockedFetch.mockResolvedValueOnce(
      jsonResponse(202, {
        job_id: "job-404-otro",
        estado: "en_cola",
        expira_en: new Date(Date.now() + 300_000).toISOString(),
        nodo: "motoshop-local",
      }),
    );
    mockedFetch.mockResolvedValueOnce(
      jsonResponse(404, {
        detail: {
          error_codigo: "ruta_no_encontrada",
          message: "recurso no encontrado",
        },
      }),
    );

    await createBankVerification({ valor: 100_000 });
    const error = await getBankVerification("job-404-otro").catch(
      (err: unknown) => err,
    );

    expect(error).toBeInstanceOf(ErpApiError);
    expect((error as ErpApiError).status).toBe(404);
    // POST + un único poll del nodo fijado: sin reintentos ni fallback.
    expect(mockedFetch).toHaveBeenCalledTimes(2);
  });

  it("test_404_sin_body_se_trata_como_miss_y_reintenta_en_el_nodo_fijado", async () => {
    mockedFetch.mockResolvedValueOnce(
      jsonResponse(202, {
        job_id: "job-404-vacio",
        estado: "en_cola",
        expira_en: new Date(Date.now() + 300_000).toISOString(),
        nodo: "motoshop-local",
      }),
    );
    mockedFetch.mockResolvedValueOnce(bodylessResponse(404));
    mockedFetch.mockResolvedValueOnce(bodylessResponse(404));
    mockedFetch.mockResolvedValueOnce(bodylessResponse(404));
    mockedFetch.mockResolvedValueOnce(
      jsonResponse(
        200,
        {
          job_id: "job-404-vacio",
          estado: "ejecutando",
          expira_en: new Date(Date.now() + 300_000).toISOString(),
        },
        { "X-Bank-Node": "primary" },
      ),
    );

    await createBankVerification({ valor: 100_000 });
    const job = await getBankVerification("job-404-vacio");

    expect(job.estado).toBe("ejecutando");
    expect(mockedFetch).toHaveBeenCalledTimes(5);

    const polls = mockedFetch.mock.calls.slice(1);
    for (const [, init] of polls.slice(0, 3)) {
      expect(requestHeaders(init)["X-Bank-Node"]).toBe("motoshop-local");
    }
    expect(requestHeaders(polls[3]?.[1])[BANK_SKIP_NODE_HEADER]).toBe(
      "motoshop-local",
    );
  });

  it("test_500_en_el_nodo_fijado_no_reintenta_y_hace_un_solo_fallback", async () => {
    mockedFetch.mockResolvedValueOnce(
      jsonResponse(202, {
        job_id: "job-500",
        estado: "en_cola",
        expira_en: new Date(Date.now() + 300_000).toISOString(),
        nodo: "motoshop-local",
      }),
    );
    mockedFetch.mockResolvedValueOnce(
      jsonResponse(500, { detail: "boom" }),
    );
    mockedFetch.mockResolvedValueOnce(
      jsonResponse(500, { detail: "también boom" }),
    );

    await createBankVerification({ valor: 100_000 });
    const error = await getBankVerification("job-500").catch(
      (err: unknown) => err,
    );

    expect(error).toBeInstanceOf(ErpApiError);
    expect((error as ErpApiError).status).toBe(500);
    // POST + un poll fijado (sin bucle) + un único fallback.
    expect(mockedFetch).toHaveBeenCalledTimes(3);

    const polls = mockedFetch.mock.calls.slice(1);
    expect(polls).toHaveLength(2);
    expect(requestHeaders(polls[0]?.[1])["X-Bank-Node"]).toBe("motoshop-local");
    expect(requestHeaders(polls[1]?.[1])[BANK_SKIP_NODE_HEADER]).toBe(
      "motoshop-local",
    );
  });

  it.each(["resuelto", "sin_coincidencia", "ambiguo", "fallido", "expirado"] as const)(
    "test_el_estado_final_%s_borra_la_afinidad_del_job",
    async (estado) => {
      const jobId = `job-final-${estado}`;
      mockedFetch.mockResolvedValueOnce(
        jsonResponse(202, {
          job_id: jobId,
          estado: "en_cola",
          expira_en: new Date(Date.now() + 300_000).toISOString(),
          nodo: "motoshop-local",
        }),
      );
      mockedFetch.mockResolvedValueOnce(
        jsonResponse(200, {
          job_id: jobId,
          estado,
          expira_en: new Date(Date.now() + 300_000).toISOString(),
        }),
      );
      mockedFetch.mockResolvedValueOnce(
        jsonResponse(200, {
          job_id: jobId,
          estado: "ejecutando",
          expira_en: new Date(Date.now() + 300_000).toISOString(),
        }),
      );

      await createBankVerification({ valor: 100_000 });
      const terminal = await getBankVerification(jobId);
      expect(terminal.estado).toBe(estado);

      await getBankVerification(jobId);

      const secondPoll = mockedFetch.mock.calls[2]?.[1];
      expect(requestHeaders(secondPoll)["X-Bank-Node"]).toBeUndefined();
    },
  );

  it("test_el_header_del_proxy_gana_sobre_el_nodo_del_body", async () => {
    mockedFetch.mockResolvedValueOnce(
      jsonResponse(
        202,
        {
          job_id: "job-header-gana",
          estado: "en_cola",
          expira_en: new Date(Date.now() + 300_000).toISOString(),
          nodo: "motoshop-local",
        },
        { "X-Bank-Node": "masvital-local" },
      ),
    );
    mockedFetch.mockResolvedValueOnce(
      jsonResponse(200, {
        job_id: "job-header-gana",
        estado: "ejecutando",
        expira_en: new Date(Date.now() + 300_000).toISOString(),
      }),
    );

    await createBankVerification({ valor: 100_000 });
    await getBankVerification("job-header-gana");

    const [, pollInit] = mockedFetch.mock.calls[1] ?? [];
    expect(requestHeaders(pollInit)["X-Bank-Node"]).toBe("masvital-local");
  });

  it("test_ignora_un_nodo_del_body_que_no_es_un_label_conocido", async () => {
    mockedFetch.mockResolvedValueOnce(
      jsonResponse(202, {
        job_id: "job-label-desconocido",
        estado: "en_cola",
        expira_en: new Date(Date.now() + 300_000).toISOString(),
        nodo: "nodo-inventado.example",
      }),
    );
    mockedFetch.mockResolvedValueOnce(
      jsonResponse(200, {
        job_id: "job-label-desconocido",
        estado: "ejecutando",
        expira_en: new Date(Date.now() + 300_000).toISOString(),
      }),
    );

    await createBankVerification({ valor: 100_000 });
    await getBankVerification("job-label-desconocido");

    const [, pollInit] = mockedFetch.mock.calls[1] ?? [];
    expect(requestHeaders(pollInit)["X-Bank-Node"]).toBeUndefined();
  });
});
