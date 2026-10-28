import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useBankVerification } from "@/lib/api/hooks";
import { createBankVerification, type BankJob } from "@/lib/erp/bank";
import { useColaVerificacion, type PedidoVerificacion } from "./useColaVerificacion";

vi.mock("@/lib/api/hooks", () => ({ useBankVerification: vi.fn() }));
vi.mock("@/lib/erp/bank", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/erp/bank")>();
  return { ...actual, createBankVerification: vi.fn() };
});

const A: PedidoVerificacion = {
  clave: "FVP-1",
  codClase: "FVP",
  numDocumento: "1",
  fecha: "2026-10-27",
  valor: 42000,
  referencia: "FVP-1",
};
const B: PedidoVerificacion = {
  clave: "FVP-2",
  codClase: "FVP",
  numDocumento: "2",
  fecha: "2026-10-27",
  valor: 6600,
  referencia: "FVP-2",
};

/** Lo que devuelve el sondeo, por `job_id`. */
let jobs: Record<string, BankJob | undefined> = {};

function job(jobId: string, overrides: Partial<BankJob> = {}): BankJob {
  return {
    job_id: jobId,
    estado: "en_cola",
    expira_en: new Date(Date.now() + 600_000).toISOString(),
    error: null,
    ...overrides,
  } as BankJob;
}

function Harness({
  pedidos,
  onTerminado,
}: {
  pedidos: PedidoVerificacion[];
  onTerminado: (p: PedidoVerificacion, j: BankJob) => void;
}): JSX.Element {
  const cola = useColaVerificacion(onTerminado);
  return (
    <div>
      <button type="button" onClick={() => pedidos.forEach((p) => cola.encolar(p))}>
        encolar
      </button>
      <span data-testid="pos-a">{cola.posicion("FVP-1") ?? "fuera"}</span>
      <span data-testid="pos-b">{cola.posicion("FVP-2") ?? "fuera"}</span>
      <span data-testid="total">{cola.total}</span>
      <span data-testid="estado-a">{cola.sesiones["FVP-1"]?.estado ?? "sin"}</span>
      <span data-testid="estado-b">{cola.sesiones["FVP-2"]?.estado ?? "sin"}</span>
      <span data-testid="pct-a">{cola.sesiones["FVP-1"]?.pct ?? "sin"}</span>
    </div>
  );
}

beforeEach(() => {
  jobs = {};
  vi.mocked(createBankVerification).mockReset();
  vi.mocked(useBankVerification).mockReset();
  vi.mocked(useBankVerification).mockImplementation((jobId) => {
    const data = jobId ? jobs[jobId] : undefined;
    return {
      data,
      error: undefined,
      isLoading: false,
      isValidating: false,
      mutate: vi.fn(),
    } as unknown as ReturnType<typeof useBankVerification>;
  });
});

describe("useColaVerificacion", () => {
  it("con dos pedidos, sólo crea el job del primero y el otro queda en cola", async () => {
    vi.mocked(createBankVerification).mockResolvedValueOnce(job("job-A"));
    render(<Harness pedidos={[A, B]} onTerminado={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /encolar/i }));

    await waitFor(() =>
      expect(screen.getByTestId("estado-a").textContent).toBe("consultando"),
    );
    expect(createBankVerification).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("estado-b").textContent).toBe("en_cola");
    expect(screen.getByTestId("pos-b").textContent).toBe("2");
  });

  it("cuando el primero termina, estampa y arranca el segundo solo", async () => {
    const terminado = vi.fn();
    vi.mocked(createBankVerification)
      .mockResolvedValueOnce(job("job-A"))
      .mockResolvedValueOnce(job("job-B"));
    jobs["job-A"] = job("job-A", { estado: "resuelto" } as Partial<BankJob>);

    render(<Harness pedidos={[A, B]} onTerminado={terminado} />);
    fireEvent.click(screen.getByRole("button", { name: /encolar/i }));

    await waitFor(() => expect(terminado).toHaveBeenCalledTimes(1));
    expect(terminado).toHaveBeenCalledWith(A, expect.objectContaining({ job_id: "job-A" }));

    // El segundo toma el turno sin intervención del operador.
    await waitFor(() =>
      expect(screen.getByTestId("estado-b").textContent).toBe("consultando"),
    );
    expect(createBankVerification).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("pos-a").textContent).toBe("fuera");
  });

  it("refleja la etapa y el porcentaje que publica el nodo", async () => {
    vi.mocked(createBankVerification).mockResolvedValueOnce(job("job-A"));
    jobs["job-A"] = job("job-A", {
      estado: "ejecutando",
      resultado: { progreso: { paso: "cuenta_abierta", pct: 55 } },
    } as Partial<BankJob>);

    render(<Harness pedidos={[A]} onTerminado={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /encolar/i }));

    await waitFor(() => expect(screen.getByTestId("pct-a").textContent).toBe("55"));
    expect(screen.getByTestId("estado-a").textContent).toBe("consultando");
  });

  it("si el job no arranca, libera el turno para el siguiente", async () => {
    vi.mocked(createBankVerification)
      .mockRejectedValueOnce(new Error("sin red"))
      .mockResolvedValueOnce(job("job-B"));

    render(<Harness pedidos={[A, B]} onTerminado={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /encolar/i }));

    await waitFor(() =>
      expect(screen.getByTestId("estado-b").textContent).toBe("consultando"),
    );
    expect(screen.getByTestId("estado-a").textContent).toBe("fallido");
    expect(screen.getByTestId("pos-a").textContent).toBe("fuera");
  });

  it("encolar dos veces la misma factura no la duplica", async () => {
    vi.mocked(createBankVerification).mockResolvedValueOnce(job("job-A"));
    render(<Harness pedidos={[A, A]} onTerminado={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /encolar/i }));

    await waitFor(() =>
      expect(screen.getByTestId("estado-a").textContent).toBe("consultando"),
    );
    expect(screen.getByTestId("total").textContent).toBe("1");
  });
});
