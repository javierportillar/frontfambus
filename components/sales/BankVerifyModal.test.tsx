import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useBankVerification } from "@/lib/api/hooks";
import {
  createBankVerification,
  type BankCandidato,
  type BankJob,
} from "@/lib/erp/bank";
import { BankVerifyModal } from "./BankVerifyModal";

vi.mock("@/lib/api/hooks", () => ({ useBankVerification: vi.fn() }));
vi.mock("@/lib/erp/bank", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/erp/bank")>();
  return { ...actual, createBankVerification: vi.fn() };
});

const CANDIDATO: BankCandidato = {
  id: "cand-1",
  valor: "42000.00",
  pagadorNombre: "LEDER ARMA",
  referencia: "0092405445",
  fecha: "2026-10-24",
};

function job(overrides: Partial<BankJob> = {}): BankJob {
  return {
    job_id: "job-1",
    estado: "en_cola",
    expira_en: new Date(Date.now() + 600_000).toISOString(),
    ...overrides,
  } as BankJob;
}

function montar(overrides: Partial<React.ComponentProps<typeof BankVerifyModal>> = {}) {
  return render(
    <BankVerifyModal
      open
      onClose={() => undefined}
      valor={42000}
      fecha="2026-10-24"
      referencia="FVP-3679"
      {...overrides}
    />,
  );
}

beforeEach(() => {
  vi.mocked(useBankVerification).mockReset();
  vi.mocked(createBankVerification).mockReset();
  vi.mocked(useBankVerification).mockReturnValue({
    data: undefined,
    error: undefined,
    isLoading: false,
    isValidating: false,
    mutate: vi.fn(),
  } as unknown as ReturnType<typeof useBankVerification>);
});

describe("BankVerifyModal", () => {
  it("pide la verificación con el importe y la fecha de la venta", async () => {
    vi.mocked(createBankVerification).mockResolvedValue(job());
    montar();

    fireEvent.click(screen.getByRole("button", { name: /verificar en el banco/i }));

    await waitFor(() =>
      expect(createBankVerification).toHaveBeenCalledWith({
        valor: 42000,
        fecha: "2026-10-24",
        nombreEsperado: undefined,
      }),
    );
  });

  it("muestra el pago encontrado con pagador, valor, fecha y referencia", async () => {
    vi.mocked(createBankVerification).mockResolvedValue(job());
    vi.mocked(useBankVerification).mockReturnValue({
      data: job({
        estado: "resuelto",
        resultado: { candidato: CANDIDATO },
      } as Partial<BankJob>),
      error: undefined,
      isLoading: false,
      isValidating: false,
      mutate: vi.fn(),
    } as unknown as ReturnType<typeof useBankVerification>);
    montar();

    expect(await screen.findByTestId("bank-verify-confirmation")).toBeDefined();
    expect(screen.getByText("LEDER ARMA")).toBeDefined();
    expect(screen.getByText("0092405445")).toBeDefined();
    expect(screen.getByText(/Pago encontrado/)).toBeDefined();
  });

  it("sin coincidencia nombra el valor y el día consultado", async () => {
    vi.mocked(createBankVerification).mockResolvedValue(job());
    vi.mocked(useBankVerification).mockReturnValue({
      data: job({ estado: "sin_coincidencia" } as Partial<BankJob>),
      error: undefined,
      isLoading: false,
      isValidating: false,
      mutate: vi.fn(),
    } as unknown as ReturnType<typeof useBankVerification>);
    montar();

    const aviso = await screen.findByRole("status");
    expect(aviso.textContent).toContain("42.000");
    expect(aviso.textContent).toMatch(/24 de octubre/i);
  });

  it("un fallo del nodo muestra el mensaje estable, no el crudo", async () => {
    vi.mocked(createBankVerification).mockResolvedValue(job());
    vi.mocked(useBankVerification).mockReturnValue({
      data: job({ estado: "fallido", error: "porta_no_disponible" } as Partial<BankJob>),
      error: undefined,
      isLoading: false,
      isValidating: false,
      mutate: vi.fn(),
    } as unknown as ReturnType<typeof useBankVerification>);
    montar();

    const alerta = await screen.findByRole("alert");
    expect(alerta.textContent?.length).toBeGreaterThan(0);
  });

  it("no consulta nada mientras está cerrado", () => {
    montar({ open: false });
    expect(screen.queryByTestId("bank-verify-modal")).toBeNull();
    expect(createBankVerification).not.toHaveBeenCalled();
  });
});
