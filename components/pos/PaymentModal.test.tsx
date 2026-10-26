import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { usePOSStore } from "@/lib/pos/store";
import { useBankVerification } from "@/lib/api/hooks";
import { submitSale } from "@/lib/api/pos";
import {
  BankNodeError,
  createBankVerification,
  listBankCandidates,
  type BankCandidato,
  type BankJob,
} from "@/lib/erp/bank";
import { PaymentModal } from "./PaymentModal";

vi.mock("@/lib/api/hooks", () => ({ useBankVerification: vi.fn() }));
vi.mock("@/lib/erp/bank", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/erp/bank")>();
  return {
    ...actual,
    createBankVerification: vi.fn(),
    listBankCandidates: vi.fn(),
  };
});
vi.mock("@/lib/api/pos", () => ({
  submitSale: vi.fn(),
  saveCashSession: vi.fn(),
}));

const FUTURO = new Date(Date.now() + 300_000).toISOString();

const CANDIDATO_UNICO: BankCandidato = {
  id: "cand-1",
  valor: "476000.00",
  pagadorNombre: "CRISTOPHER BENAMIDES P",
  referencia: "0092055984",
  fecha: "2026-10-21",
};

const CANDIDATO_B: BankCandidato = {
  id: "cand-2",
  valor: "476000.00",
  pagadorNombre: "OTRO PAGADOR",
  referencia: "0092055999",
  fecha: "2026-10-21",
};

/** Jobs que devuelve el hook según el `job_id` que el componente está sondeando. */
const jobsPorId: Record<string, BankJob> = {};

function abrirModal(cliente?: { name: string; nit: string }): void {
  usePOSStore.setState({
    isPaymentModalOpen: true,
    cart: [
      {
        id: "OIL-1",
        product: {
          sku: "OIL-1",
          name: "Aceite Castrol 20W50",
          price: 400000,
          vatPct: 19,
        },
        candet: 1,
        valuni: 400000,
        discountPct: 0,
        dctpes: 0,
        vatPct: 19,
        ivapes: 76000,
        ipoPct: 0,
        ipopes: 0,
        totdet: 476000,
      },
    ],
    customer: cliente
      ? {
          id: `nit-${cliente.nit}`,
          name: cliente.name,
          nit: cliente.nit,
          phone: "",
          email: "",
          address: "",
          city: "",
        }
      : {
          id: "CF-222222222222",
          name: "Consumidor Final",
          nit: "222222222222",
          phone: "",
          email: "",
          address: "",
          city: "",
        },
  });
}

function referenciaInput(): HTMLInputElement {
  const input = document.querySelector("#refInput");
  if (!(input instanceof HTMLInputElement)) {
    throw new Error("El campo de referencia no está en el DOM");
  }
  return input;
}

function elegirTransferencia(): void {
  fireEvent.click(screen.getByRole("button", { name: /Transferencia/ }));
}

function verificar(): void {
  fireEvent.click(screen.getByRole("button", { name: /Verificar/ }));
}

beforeEach(() => {
  for (const key of Object.keys(jobsPorId)) delete jobsPorId[key];

  vi.mocked(useBankVerification).mockImplementation(
    (jobId: string | null) =>
      ({
        data: jobId ? jobsPorId[jobId] : undefined,
        error: undefined,
        isLoading: false,
        mutate: vi.fn(),
      }) as unknown as ReturnType<typeof useBankVerification>,
  );

  vi.mocked(createBankVerification).mockReset();
  vi.mocked(listBankCandidates).mockReset();
  vi.mocked(submitSale).mockReset();
  vi.mocked(submitSale).mockResolvedValue({
    success: true,
    offline: false,
    sale: { id: "sale-1" },
  } as unknown as ReturnType<typeof submitSale> extends never
    ? never
    : Awaited<ReturnType<typeof submitSale>>);

  usePOSStore.setState({
    isPaymentModalOpen: false,
    cart: [],
    customer: {
      id: "CF-222222222222",
      name: "Consumidor Final",
      nit: "222222222222",
    },
    lastSale: null,
    isReceiptOpen: false,
  });
});

describe("PaymentModal · verificación bancaria", () => {
  it("test_prellena_pagador_y_referencia_con_el_candidato_unico", async () => {
    jobsPorId["job-1"] = {
      job_id: "job-1",
      estado: "resuelto",
      expira_en: FUTURO,
      error: null,
      resultado: { candidato: CANDIDATO_UNICO },
    };
    vi.mocked(createBankVerification).mockResolvedValue({
      job_id: "job-1",
      estado: "en_cola",
      expira_en: FUTURO,
      error: null,
    });

    abrirModal();
    render(<PaymentModal />);
    elegirTransferencia();
    verificar();

    await waitFor(() => {
      expect(referenciaInput()).toHaveValue("0092055984");
    });
    expect(usePOSStore.getState().customer.name).toBe(
      "CRISTOPHER BENAMIDES P",
    );
  });

  it("test_no_sobrescribe_la_referencia_escrita_por_el_operador", async () => {
    jobsPorId["job-1"] = {
      job_id: "job-1",
      estado: "resuelto",
      expira_en: FUTURO,
      error: null,
      resultado: { candidato: CANDIDATO_UNICO },
    };
    vi.mocked(createBankVerification).mockResolvedValue({
      job_id: "job-1",
      estado: "en_cola",
      expira_en: FUTURO,
      error: null,
    });

    abrirModal();
    render(<PaymentModal />);
    elegirTransferencia();
    fireEvent.change(referenciaInput(), { target: { value: "111111111" } });
    verificar();

    await waitFor(() => {
      expect(usePOSStore.getState().customer.name).toBe(
        "CRISTOPHER BENAMIDES P",
      );
    });
    expect(referenciaInput()).toHaveValue("111111111");
  });

  it("test_el_prellenado_no_publica_el_pago", async () => {
    jobsPorId["job-1"] = {
      job_id: "job-1",
      estado: "resuelto",
      expira_en: FUTURO,
      error: null,
      resultado: { candidato: CANDIDATO_UNICO },
    };
    vi.mocked(createBankVerification).mockResolvedValue({
      job_id: "job-1",
      estado: "en_cola",
      expira_en: FUTURO,
      error: null,
    });

    abrirModal();
    render(<PaymentModal />);
    elegirTransferencia();
    verificar();

    await waitFor(() => {
      expect(referenciaInput()).toHaveValue("0092055984");
    });
    expect(vi.mocked(submitSale)).not.toHaveBeenCalled();
  });

  it("test_sin_candidato_los_campos_quedan_vacios_y_sin_error", async () => {
    jobsPorId["job-1"] = {
      job_id: "job-1",
      estado: "sin_coincidencia",
      expira_en: FUTURO,
      error: null,
      resultado: { candidato: null },
    };
    vi.mocked(createBankVerification).mockResolvedValue({
      job_id: "job-1",
      estado: "en_cola",
      expira_en: FUTURO,
      error: null,
    });

    abrirModal();
    render(<PaymentModal />);
    elegirTransferencia();
    verificar();

    await waitFor(() => {
      expect(
        screen.getByText(/No entró un pago de \$.*476\.000 hoy/),
      ).toBeInTheDocument();
    });
    expect(referenciaInput()).toHaveValue("");
    expect(usePOSStore.getState().customer.name).toBe("Consumidor Final");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("test_con_dos_candidatos_el_operador_elige_uno", async () => {
    jobsPorId["job-1"] = {
      job_id: "job-1",
      estado: "ambiguo",
      expira_en: FUTURO,
      error: null,
      resultado: { candidato: null, candidatos: [CANDIDATO_UNICO, CANDIDATO_B] },
    };
    vi.mocked(createBankVerification).mockResolvedValue({
      job_id: "job-1",
      estado: "en_cola",
      expira_en: FUTURO,
      error: null,
    });
    vi.mocked(listBankCandidates).mockResolvedValue({
      ambiguo: true,
      ventana: { desde: "2026-10-21", hasta: "2026-10-21" },
      candidatos: [CANDIDATO_UNICO, CANDIDATO_B],
      ultimaIngestaAt: "2026-10-21T12:00:00",
    });

    abrirModal();
    render(<PaymentModal />);
    elegirTransferencia();
    verificar();

    const elegir = await screen.findByRole("button", {
      name: /OTRO PAGADOR/,
    });
    // Nadie eligió por el operador: los campos siguen vacíos.
    expect(referenciaInput()).toHaveValue("");

    fireEvent.click(elegir);

    await waitFor(() => {
      expect(referenciaInput()).toHaveValue("0092055999");
    });
    expect(usePOSStore.getState().customer.name).toBe("OTRO PAGADOR");
  });

  it("test_la_referencia_corregida_a_mano_prevalece_al_confirmar", async () => {
    jobsPorId["job-1"] = {
      job_id: "job-1",
      estado: "resuelto",
      expira_en: FUTURO,
      error: null,
      resultado: { candidato: CANDIDATO_UNICO },
    };
    vi.mocked(createBankVerification).mockResolvedValue({
      job_id: "job-1",
      estado: "en_cola",
      expira_en: FUTURO,
      error: null,
    });

    abrirModal();
    render(<PaymentModal />);
    elegirTransferencia();
    verificar();

    await waitFor(() => {
      expect(referenciaInput()).toHaveValue("0092055984");
    });

    fireEvent.change(referenciaInput(), { target: { value: "999888777" } });
    fireEvent.click(screen.getByRole("button", { name: /Cobrar/ }));

    await waitFor(() => {
      expect(vi.mocked(submitSale)).toHaveBeenCalledTimes(1);
    });
    const payload = vi.mocked(submitSale).mock.calls[0]?.[0];
    expect(payload?.payments[0]?.reference).toBe("999888777");
  });

  it("test_el_boton_verificar_muestra_el_mensaje_de_otp_del_nodo", async () => {
    jobsPorId["job-1"] = {
      job_id: "job-1",
      estado: "esperando_otp",
      expira_en: FUTURO,
      error: null,
    };
    vi.mocked(createBankVerification).mockResolvedValue({
      job_id: "job-1",
      estado: "en_cola",
      expira_en: FUTURO,
      error: null,
    });

    abrirModal();
    render(<PaymentModal />);
    elegirTransferencia();
    verificar();

    await waitFor(() => {
      expect(
        screen.getByText(
          "El banco pide un código: ingrésalo en la consola del nodo local",
        ),
      ).toBeInTheDocument();
    });
    // El código NUNCA se pide en el navegador: no hay campo para escribirlo.
    expect(
      screen.queryByLabelText(/c[oó]digo/i),
    ).toBeNull();
    expect(
      document.querySelector('input[placeholder*="código" i]'),
    ).toBeNull();
  });

  it("test_un_503_deja_el_flujo_manual_de_pegado_intacto", async () => {
    vi.mocked(createBankVerification).mockRejectedValue(
      new BankNodeError(
        503,
        "scraper_no_habilitado",
        "Este nodo no tiene el scraper del banco habilitado.",
      ),
    );

    abrirModal();
    render(<PaymentModal />);
    elegirTransferencia();
    verificar();

    await waitFor(() => {
      expect(screen.getByText("Verificación no disponible")).toBeInTheDocument();
    });

    // El pegado manual sigue operativo.
    const qrInput = document.querySelector(
      'input[placeholder^="Pega aquí"]',
    ) as HTMLInputElement;
    fireEvent.change(qrInput, {
      target: { value: "PAGO QR JUAN PEREZ 0092055984 null $ 476.000" },
    });

    await waitFor(() => {
      expect(referenciaInput()).toHaveValue("0092055984");
    });
    expect(usePOSStore.getState().customer.name).toBe("JUAN PEREZ");
  });

  it("test_verificar_envia_modo_pago_con_el_cliente_y_sin_factura_id", async () => {
    vi.mocked(createBankVerification).mockResolvedValue({
      job_id: "job-pago",
      estado: "en_cola",
      expira_en: FUTURO,
      error: null,
    });

    abrirModal({ name: "VALERIA CASTRILLON", nit: "900123456" });
    render(<PaymentModal />);
    elegirTransferencia();
    verificar();

    await waitFor(() => {
      expect(vi.mocked(createBankVerification)).toHaveBeenCalledTimes(1);
    });
    const input = vi.mocked(createBankVerification).mock.calls[0]?.[0];
    expect(input).toEqual({
      valor: 476000,
      nitter: "900123456",
      nombreEsperado: "VALERIA CASTRILLON",
    });
    expect(input).not.toHaveProperty("facturaId");
  });

  it("test_verificar_no_envia_el_nit_placeholder_de_consumidor_final", async () => {
    vi.mocked(createBankVerification).mockResolvedValue({
      job_id: "job-consumidor-final",
      estado: "en_cola",
      expira_en: FUTURO,
      error: null,
    });

    abrirModal({ name: "CONSUMIDOR FINAL", nit: "222222222" });
    render(<PaymentModal />);
    elegirTransferencia();
    verificar();

    await waitFor(() => {
      expect(vi.mocked(createBankVerification)).toHaveBeenCalledTimes(1);
    });
    const input = vi.mocked(createBankVerification).mock.calls[0]?.[0];
    expect(input?.nitter).toBeUndefined();
    expect(input?.nombreEsperado).toBe("CONSUMIDOR FINAL");
    expect(input).not.toHaveProperty("facturaId");
  });
});
