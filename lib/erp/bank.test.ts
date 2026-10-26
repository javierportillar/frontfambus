import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api/client";
import { ErpApiError } from "./errors";
import {
  BankNodeError,
  createBankVerification,
  formatBankValor,
  getBankVerification,
  listBankCandidates,
} from "./bank";

vi.mock("@/lib/api/client", () => ({ apiFetch: vi.fn() }));

const mockedFetch = vi.mocked(apiFetch);

/** Respuesta mínima con la forma que consume `lib/erp/bank.ts`. */
function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

beforeEach(() => {
  mockedFetch.mockReset();
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
});
