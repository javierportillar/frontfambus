import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { SWRConfig } from "swr";
import { usePOSStore } from "@/lib/pos/store";
import { submitSale } from "@/lib/api/pos";
import {
  createBankVerification,
  getBankVerification,
  type BankCandidato,
  type BankJob,
} from "@/lib/erp/bank";
import { PaymentModal } from "./PaymentModal";

vi.mock("@/lib/api/pos", () => ({
  submitSale: vi.fn(),
  saveCashSession: vi.fn(),
}));
vi.mock("@/lib/erp/bank", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/erp/bank")>();
  return {
    ...actual,
    createBankVerification: vi.fn(),
    getBankVerification: vi.fn(),
    listBankCandidates: vi.fn(),
  };
});

const FUTURO = new Date(Date.now() + 300_000).toISOString();

const CANDIDATO_UNICO: BankCandidato = {
  id: "cand-1",
  valor: "476000.00",
  pagadorNombre: "CRISTOPHER BENAMIDES P",
  referencia: "0092055984",
  fecha: "2026-10-21",
  nitter: "900123456-7",
  clienteNombre: "Ferretería El Tornillo",
};

const CANDIDATO_SIN_CLIENTE: BankCandidato = {
  id: "cand-2",
  valor: "476000.00",
  pagadorNombre: "CRISTOPHER BENAMIDES P",
  referencia: "0092055984",
  fecha: "2026-10-21",
};

const CANDIDATO_CONSUMIDOR_FINAL: BankCandidato = {
  id: "cand-3",
  valor: "476000.00",
  pagadorNombre: "CRISTOPHER BENAMIDES P",
  referencia: "0092055984",
  fecha: "2026-10-21",
  nitter: "222222222",
  clienteNombre: "CONSUMIDOR FINAL",
};

function abrirModal(): void {
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
    customer: {
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

function renderModal(): void {
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <PaymentModal />
    </SWRConfig>,
  );
  fireEvent.click(screen.getByRole("button", { name: /Transferencia/ }));
}

function clickVerificar(): void {
  fireEvent.click(screen.getByRole("button", { name: /Verificar/ }));
}

function iniciarJob(jobId: string): void {
  vi.mocked(createBankVerification).mockResolvedValue({
    job_id: jobId,
    estado: "en_cola",
    expira_en: FUTURO,
    error: null,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(submitSale).mockResolvedValue({
    success: true,
    offline: false,
    sale: { id: "sale-1" },
  } as Awaited<ReturnType<typeof submitSale>>);
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

describe("PaymentModal · estados de la verificación bancaria", () => {
  it("muestra la carga inmediata, deshabilita el botón y muestra la fecha real", () => {
    vi.mocked(createBankVerification).mockReturnValue(new Promise(() => {}));

    abrirModal();
    renderModal();
    clickVerificar();

    const boton = screen.getByRole("button", { name: "Consultando el banco…" });
    expect(boton).toBeDisabled();

    const fechaEsperada = new Intl.DateTimeFormat("es-CO", {
      day: "numeric",
      month: "long",
    }).format(new Date());
    expect(screen.getByText(`Hoy, ${fechaEsperada}`)).toBeInTheDocument();
  });

  it("con un único candidato muestra la tarjeta de confirmación con NIT y cliente", async () => {
    iniciarJob("job-resuelto-presente");
    vi.mocked(getBankVerification).mockResolvedValue({
      job_id: "job-resuelto-presente",
      estado: "resuelto",
      expira_en: FUTURO,
      error: null,
      resultado: {
        ventana: { desde: "2026-10-22", hasta: "2026-10-22" },
        movimientos: 6,
        candidato: CANDIDATO_UNICO,
      },
    } satisfies BankJob);

    abrirModal();
    renderModal();
    clickVerificar();

    const tarjeta = await screen.findByTestId("bank-verification-confirmation");
    expect(within(tarjeta).getByText("Pago confirmado")).toBeInTheDocument();
    expect(within(tarjeta).getByText("CRISTOPHER BENAMIDES P")).toBeInTheDocument();
    expect(within(tarjeta).getByText("900123456-7")).toBeInTheDocument();
    expect(within(tarjeta).getByText("Ferretería El Tornillo")).toBeInTheDocument();
    expect(within(tarjeta).getByText(/\$.*476\.000/)).toBeInTheDocument();
    expect(within(tarjeta).getByText("21 de octubre de 2026")).toBeInTheDocument();
    expect(within(tarjeta).getByText("0092055984")).toBeInTheDocument();
    expect(
      within(tarjeta).getByText("6 movimientos revisados del 22 de octubre"),
    ).toBeInTheDocument();
  });

  it("sin nitter ni cliente_nombre no muestra filas vacías ni undefined", async () => {    iniciarJob("job-resuelto-sin-cliente");
    vi.mocked(getBankVerification).mockResolvedValue({
      job_id: "job-resuelto-sin-cliente",
      estado: "resuelto",
      expira_en: FUTURO,
      error: null,
      resultado: {
        ventana: { desde: "2026-10-22", hasta: "2026-10-22" },
        movimientos: 6,
        candidato: CANDIDATO_SIN_CLIENTE,
      },
    } satisfies BankJob);

    abrirModal();
    renderModal();
    clickVerificar();

    const tarjeta = await screen.findByTestId("bank-verification-confirmation");
    expect(within(tarjeta).getByText("Pago confirmado")).toBeInTheDocument();
    expect(within(tarjeta).queryByText("NIT del cliente")).toBeNull();
    expect(within(tarjeta).queryByText("Cliente")).toBeNull();
    expect(within(tarjeta).queryByText(/undefined/i)).toBeNull();
  });

  it("oculta el NIT placeholder pero mantiene la fila de CONSUMIDOR FINAL", async () => {
    iniciarJob("job-consumidor-final");
    vi.mocked(getBankVerification).mockResolvedValue({
      job_id: "job-consumidor-final",
      estado: "resuelto",
      expira_en: FUTURO,
      error: null,
      resultado: {
        ventana: { desde: "2026-10-22", hasta: "2026-10-22" },
        movimientos: 6,
        candidato: CANDIDATO_CONSUMIDOR_FINAL,
      },
    } satisfies BankJob);

    abrirModal();
    renderModal();
    clickVerificar();

    const tarjeta = await screen.findByTestId("bank-verification-confirmation");
    expect(within(tarjeta).queryByText("NIT del cliente")).toBeNull();
    expect(within(tarjeta).queryByText("222222222")).toBeNull();
    expect(within(tarjeta).getByText("Cliente")).toBeInTheDocument();
    expect(within(tarjeta).getByText("CONSUMIDOR FINAL")).toBeInTheDocument();
  });

  it("sin coincidencia no muestra check y ofrece reintentar con el monto exacto", async () => {
    iniciarJob("job-sin-coincidencia");
    vi.mocked(getBankVerification).mockResolvedValue({
      job_id: "job-sin-coincidencia",
      estado: "sin_coincidencia",
      expira_en: FUTURO,
      error: null,
      resultado: {
        ventana: { desde: "2026-10-22", hasta: "2026-10-22" },
        movimientos: 4,
        candidato: null,
      },
    } satisfies BankJob);

    abrirModal();
    renderModal();
    clickVerificar();

    const mensaje = await screen.findByText(/No entró un pago de/);
    expect(mensaje).toHaveTextContent("476.000");
    expect(mensaje).toHaveTextContent("hoy");
    expect(
      screen.queryByTestId("bank-verification-confirmation"),
    ).toBeNull();
    expect(screen.queryByText("Pago confirmado")).toBeNull();

    const reintentar = screen.getByRole("button", { name: "Reintentar" });
    expect(reintentar).toBeEnabled();
    fireEvent.click(reintentar);
    await waitFor(() => {
      expect(vi.mocked(createBankVerification)).toHaveBeenCalledTimes(2);
    });
  });

  it("expirado avisa que la PC no está en línea y no muestra código de error", async () => {
    iniciarJob("job-expirado");
    vi.mocked(getBankVerification).mockResolvedValue({
      job_id: "job-expirado",
      estado: "expirado",
      expira_en: FUTURO,
      error: "expirado",
    } satisfies BankJob);

    abrirModal();
    renderModal();
    clickVerificar();

    const mensaje = await screen.findByText(/La PC no está en línea/);
    expect(mensaje).toBeInTheDocument();
    expect(screen.queryByText(/código:/)).toBeNull();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeEnabled();
  });
});
