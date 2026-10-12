import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useClientes, type ClientesResponse } from "@/lib/api/hooks";
import { ClientesIndex } from "./ClientesIndex";

vi.mock("@/lib/api/hooks", () => ({
  CLIENTES_DEFAULT_PAGE_SIZE: 20,
  useClientes: vi.fn(),
  useClientePerfil: vi.fn(),
  useClienteFacturas: vi.fn(),
}));

function makeResponse(overrides: Partial<ClientesResponse> = {}): ClientesResponse {
  return {
    periodo: { fecha_inicio: "2025-09-27", fecha_fin: "2026-09-27" },
    resumen: {
      clientes_identificados: 38,
      ventas_totales_validas: 706093766.54,
      ventas_identificadas: 42247001,
      facturas_totales: 7000,
      ticket_promedio_global: 1111763,
      top10_ventas_suma: 34130000,
      top10_participacion: 0.0483,
      ventas_sin_identificar: 663846765.54,
      facturas_sin_identificar: 6695,
    },
    items: [
      {
        customer_id: "1085320887",
        nombre_canonico: "Distribuidora Norte",
        ventas_total: 5557101,
        facturas: 12,
        ticket_promedio: 463091,
        primera_compra: "2025-10-01",
        ultima_compra: "2026-09-10",
      },
    ],
    paginacion: { pagina: 1, tamano_pagina: 20, total_filas: 38, total_paginas: 2 },
    ...overrides,
  };
}

function result(overrides: Partial<ReturnType<typeof useClientes>> = {}) {
  return {
    data: undefined,
    error: undefined,
    isLoading: false,
    isValidating: false,
    mutate: vi.fn(),
    ...overrides,
  } as ReturnType<typeof useClientes>;
}

const useClientesMock = vi.mocked(useClientes);

describe("ClientesIndex", () => {
  afterEach(() => vi.useRealTimers());

  beforeEach(() => {
    vi.clearAllMocks();
    useClientesMock.mockReturnValue(result({ isLoading: true }));
  });

  it("shows a loading state and defaults to the previous twelve months, sorted by sales", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-27T18:00:00.000Z"));
    render(<ClientesIndex />);

    expect(useClientesMock).toHaveBeenCalledWith("2025-09-27", "2026-09-27", expect.objectContaining({
      query: "",
      page: 1,
      sortBy: "ventas",
      sortOrder: "desc",
    }));
  });

  it("recovers the period passed from a profile", () => {
    render(<ClientesIndex initialFechaInicio="2026-01-01" initialFechaFin="2026-06-30" initialQuery="norte" />);

    expect(useClientesMock).toHaveBeenCalledWith("2026-01-01", "2026-06-30", expect.objectContaining({
      query: "norte",
      page: 1,
    }));
  });

  it("links each customer to their profile preserving the period", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-27T18:00:00.000Z"));
    useClientesMock.mockReturnValue(result({ data: makeResponse() }));
    render(<ClientesIndex />);

    const ranking = within(screen.getByRole("list", { name: "Clientes del período" }));
    expect(ranking.getByRole("link", { name: "Distribuidora Norte" })).toHaveAttribute(
      "href",
      "/dashboards/clientes/1085320887?fecha_inicio=2025-09-27&fecha_fin=2026-09-27",
    );
    expect(screen.getByText("38")).toBeInTheDocument();
    expect(screen.getByText("4.8%")).toBeInTheDocument();
  });

  it("applies a period shortcut", async () => {
    const user = userEvent.setup();
    render(<ClientesIndex />);

    await user.click(screen.getByRole("button", { name: "3 meses" }));

    await waitFor(() => expect(useClientesMock).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ page: 1 }),
    ));
    const lastCall = useClientesMock.mock.calls.at(-1);
    expect(lastCall?.[0]).not.toBe(lastCall?.[1]);
  });

  it("debounces the search before refetching", async () => {
    render(<ClientesIndex />);
    const initialCalls = useClientesMock.mock.calls.length;

    fireEvent.change(screen.getByLabelText("Buscar cliente por nombre o documento"), {
      target: { value: "distri" },
    });

    await waitFor(() => expect(useClientesMock).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ query: "distri", page: 1 }),
    ), { timeout: 1500 });
    expect(useClientesMock.mock.calls.length).toBeGreaterThan(initialCalls);
  });

  it("paginates with the server page parameter", async () => {
    const user = userEvent.setup();
    useClientesMock.mockReturnValue(result({ data: makeResponse() }));
    render(<ClientesIndex />);

    expect(screen.getByRole("button", { name: "Anterior" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Siguiente" }));

    await waitFor(() => expect(useClientesMock).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ page: 2 }),
    ));
  });

  it("shows an empty state when there are no identified customers", () => {
    useClientesMock.mockReturnValue(result({
      data: makeResponse({ items: [], paginacion: { pagina: 1, tamano_pagina: 20, total_filas: 0, total_paginas: 0 } }),
    }));
    render(<ClientesIndex />);

    expect(screen.getByRole("status")).toHaveTextContent("No hay clientes identificados");
  });

  it("shows API errors and offers a retry", async () => {
    const user = userEvent.setup();
    const mutate = vi.fn();
    useClientesMock.mockReturnValue(result({ error: new Error("API error 500 on clientes"), mutate }));
    render(<ClientesIndex />);

    expect(screen.getByRole("alert")).toHaveTextContent("No pudimos cargar los clientes");
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(mutate).toHaveBeenCalledOnce();
  });
});
