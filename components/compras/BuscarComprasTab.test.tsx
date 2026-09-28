import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useComprasBuscar, type ComprasBusquedaResponse } from "@/lib/api/hooks";
import { BuscarComprasTab } from "./BuscarComprasTab";

vi.mock("@/lib/api/hooks", () => ({ useComprasBuscar: vi.fn() }));

const searchResponse = (page = 1, hasMore = false): ComprasBusquedaResponse => ({
  query: "Alpha part",
  periodo: { fecha_inicio: "2025-09-27", fecha_fin: "2026-09-27" },
  documentos: [{
    business_date: "2026-09-10",
    cod_clase: "FC",
    num_documento: "A/194",
    nit_proveedor: "900123456",
    nombre_proveedor: "Distribuidora Norte",
    total_factura: 125000,
    num_items: 3,
    productos_coincidentes: "Alpha part",
    tipo_coincidencia: "producto",
  }],
  paginacion: { page, page_size: 20, total_documentos: 21, has_more: hasMore },
});

const useSearchMock = vi.mocked(useComprasBuscar);

function result(overrides: Partial<ReturnType<typeof useComprasBuscar>> = {}) {
  return {
    data: undefined,
    error: undefined,
    isLoading: false,
    isValidating: false,
    mutate: vi.fn(),
    ...overrides,
  } as ReturnType<typeof useComprasBuscar>;
}

describe("BuscarComprasTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSearchMock.mockReturnValue(result());
  });

  afterEach(() => vi.useRealTimers());

  it("does not render stale search results before submitting a query", () => {
    useSearchMock.mockReturnValue(result({ data: searchResponse(1, true) }));
    render(<BuscarComprasTab />);

    expect(screen.queryByRole("link", { name: /Abrir factura/ })).not.toBeInTheDocument();
    expect(screen.getByText(/últimos 12 meses/)).toBeInTheDocument();
  });

  it("searches across invoice, supplier and product and links the complete result row", async () => {
    const user = userEvent.setup();
    useSearchMock.mockReturnValue(result({ data: searchResponse() }));
    render(<BuscarComprasTab />);

    await user.type(
      screen.getByRole("searchbox", { name: "Buscar proveedor, producto, SKU o número de factura" }),
      "Alpha part",
    );
    await user.click(screen.getByRole("button", { name: "Buscar compras" }));

    expect(screen.getByRole("heading", { name: /Resultados para “Alpha part”/ })).toBeInTheDocument();
    const resultLink = screen.getByRole("link", {
      name: "Abrir factura A/194 clase FC de Distribuidora Norte",
    });
    expect(resultLink).toHaveAttribute(
      "href",
      "/dashboards/compras/dia/2026-09-10/documento/A%2F194?cod_clase=FC",
    );
    expect(resultLink).toHaveTextContent("Alpha part");
    expect(useSearchMock).toHaveBeenLastCalledWith(
      "Alpha part",
      expect.any(String),
      expect.any(String),
      1,
      20,
    );
  });

  it("changes pages without losing the submitted search", async () => {
    const user = userEvent.setup();
    useSearchMock.mockImplementation((_query, _start, _end, page = 1) => result({
      data: searchResponse(page, page === 1),
    }));
    render(<BuscarComprasTab />);

    await user.type(
      screen.getByRole("searchbox", { name: "Buscar proveedor, producto, SKU o número de factura" }),
      "Alpha",
    );
    await user.click(screen.getByRole("button", { name: "Buscar compras" }));
    await user.click(screen.getByRole("button", { name: "Siguiente" }));

    await waitFor(() => expect(useSearchMock).toHaveBeenLastCalledWith(
      "Alpha",
      expect.any(String),
      expect.any(String),
      2,
      20,
    ));
  });

  it("disables the active query when the selected range grows beyond ten years", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-27T18:00:00.000Z"));
    useSearchMock.mockReturnValue(result({ data: searchResponse() }));
    render(<BuscarComprasTab />);

    fireEvent.change(screen.getByRole("searchbox", {
      name: "Buscar proveedor, producto, SKU o número de factura",
    }), { target: { value: "Alpha" } });
    fireEvent.submit(screen.getByRole("button", { name: "Buscar compras" }).closest("form")!);
    expect(screen.getByRole("heading", { name: /Resultados para/ })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2010-01-01" } });

    expect(screen.getByRole("alert")).toHaveTextContent("hasta 10 años");
    expect(screen.getByRole("button", { name: "Buscar compras" })).toBeDisabled();
    expect(screen.queryByRole("link", { name: /Abrir factura/ })).not.toBeInTheDocument();
    expect(useSearchMock).toHaveBeenLastCalledWith("", "2010-01-01", "2026-09-27", 1, 20);
  });

  it("shows a retry state when the search endpoint fails", async () => {
    const user = userEvent.setup();
    const mutate = vi.fn();
    useSearchMock.mockReturnValue(result({ error: new Error("API error 500 on search"), mutate }));
    render(<BuscarComprasTab />);

    await user.type(
      screen.getByRole("searchbox", { name: "Buscar proveedor, producto, SKU o número de factura" }),
      "Alpha",
    );
    await user.click(screen.getByRole("button", { name: "Buscar compras" }));
    await user.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(mutate).toHaveBeenCalledOnce();
  });
});
