import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  useClienteFacturas,
  useClientePerfil,
  type ClienteFacturasResponse,
  type ClientePerfilResponse,
} from "@/lib/api/hooks";
import { ClienteProfile } from "./ClienteProfile";

vi.mock("@/lib/api/hooks", () => ({
  CLIENTES_DEFAULT_PAGE_SIZE: 20,
  useClientePerfil: vi.fn(),
  useClienteFacturas: vi.fn(),
  useClientes: vi.fn(),
}));

const CUSTOMER_ID = "1085320887";
const firstInvoice = {
  fecha_negocio: "2026-09-10",
  cod_clase: "FV",
  num_documento: "A-100",
  total_factura: 125000,
  lineas: 3,
};

function makeProfile(overrides: Partial<ClientePerfilResponse> = {}): ClientePerfilResponse {
  return {
    cliente: { customer_id: CUSTOMER_ID, nombre_canonico: "Distribuidora Norte" },
    resumen: {
      ventas_total: 125000,
      facturas: 1,
      ticket_promedio: 125000,
      primera_compra: "2026-09-10",
      ultima_compra: "2026-09-10",
      unidades_vendidas: 6,
    },
    productos_top: [
      { sku: "SKU-1", nombre_producto: "Alpha product", unidades: 3, ventas_valor: 60000, facturas: 1 },
      { sku: null, nombre_producto: "Servicio de envío", unidades: 1, ventas_valor: 5000, facturas: 1 },
    ],
    periodo: { fecha_inicio: "2025-09-27", fecha_fin: "2026-09-27" },
    ...overrides,
  };
}

function makeInvoices(overrides: Partial<ClienteFacturasResponse> = {}): ClienteFacturasResponse {
  return {
    items: [firstInvoice],
    total: 1,
    total_lineas: 3,
    total_paginas: 1,
    pagina: 1,
    tamano_pagina: 20,
    ...overrides,
  };
}

function useMetricsResult<T>(overrides: Partial<{
  data: T | undefined;
  error: Error | undefined;
  isLoading: boolean;
  isValidating: boolean;
  mutate: () => void;
}> = {}) {
  return {
    data: undefined,
    error: undefined,
    isLoading: false,
    isValidating: false,
    mutate: vi.fn(),
    ...overrides,
  };
}

const useProfileMock = vi.mocked(useClientePerfil);
const useFacturasMock = vi.mocked(useClienteFacturas);

describe("ClienteProfile", () => {
  afterEach(() => vi.useRealTimers());

  beforeEach(() => {
    vi.clearAllMocks();
    useProfileMock.mockReturnValue(useMetricsResult<ClientePerfilResponse>({ isLoading: true }) as ReturnType<typeof useClientePerfil>);
    useFacturasMock.mockReturnValue(useMetricsResult<ClienteFacturasResponse>() as ReturnType<typeof useClienteFacturas>);
  });

  it("shows a loading state while the profile request is pending", () => {
    render(<ClienteProfile customerId={CUSTOMER_ID} />);

    expect(screen.getByRole("status", { name: "Cargando perfil del cliente" })).toBeInTheDocument();
    expect(useProfileMock).toHaveBeenCalledWith(CUSTOMER_ID, expect.any(String), expect.any(String));
  });

  it("defaults the date filters to the previous twelve months", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-27T18:00:00.000Z"));
    render(<ClienteProfile customerId={CUSTOMER_ID} />);

    expect(screen.getByLabelText("Desde")).toHaveValue("2025-09-27");
    expect(screen.getByLabelText("Hasta")).toHaveValue("2026-09-27");
    expect(useProfileMock).toHaveBeenCalledWith(CUSTOMER_ID, "2025-09-27", "2026-09-27");
  });

  it("honors the period passed from the directory", () => {
    render(<ClienteProfile customerId={CUSTOMER_ID} initialFechaInicio="2026-01-01" initialFechaFin="2026-06-30" />);

    expect(screen.getByLabelText("Desde")).toHaveValue("2026-01-01");
    expect(screen.getByLabelText("Hasta")).toHaveValue("2026-06-30");
    expect(useProfileMock).toHaveBeenCalledWith(CUSTOMER_ID, "2026-01-01", "2026-06-30");
  });

  it("does not fetch for an invalid customer id and shows a validation state", () => {
    render(<ClienteProfile customerId=".." />);

    expect(screen.getByRole("alert")).toHaveTextContent("Cliente inválido");
    expect(useProfileMock).toHaveBeenCalledWith(null, expect.any(String), expect.any(String));
  });

  it("does not request profile data when the selected range exceeds ten years", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-27T18:00:00.000Z"));
    render(<ClienteProfile customerId={CUSTOMER_ID} />);

    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2010-01-01" } });

    expect(screen.getByRole("alert")).toHaveTextContent("hasta 10 años");
    expect(useProfileMock).toHaveBeenLastCalledWith(null, "2010-01-01", "2026-09-27");
  });

  it("renders the summary, top products and invoice history with deep links", () => {
    useProfileMock.mockReturnValue(useMetricsResult<ClientePerfilResponse>({ data: makeProfile() }) as ReturnType<typeof useClientePerfil>);
    useFacturasMock.mockReturnValue(useMetricsResult<ClienteFacturasResponse>({ data: makeInvoices() }) as ReturnType<typeof useClienteFacturas>);
    render(<ClienteProfile customerId={CUSTOMER_ID} />);

    expect(screen.getByRole("heading", { name: "Resumen del cliente" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Productos más comprados" })).toBeInTheDocument();
    const productos = within(screen.getByRole("list", { name: "Productos más comprados por el cliente" }));
    expect(productos.getByRole("link", { name: "Alpha product" })).toHaveAttribute(
      "href",
      "/dashboards/productos/SKU-1",
    );
    expect(productos.getByText("Servicio de envío")).toBeInTheDocument();
    const facturas = within(screen.getByRole("list", { name: "Facturas del cliente" }));
    expect(facturas.getByRole("link", { name: "2026-09-10" })).toHaveAttribute(
      "href",
      "/dashboards/ventas/dia/2026-09-10",
    );
  });

  it("preserves the selected period and search on the back link", () => {
    useProfileMock.mockReturnValue(useMetricsResult<ClientePerfilResponse>({ data: makeProfile() }) as ReturnType<typeof useClientePerfil>);
    useFacturasMock.mockReturnValue(useMetricsResult<ClienteFacturasResponse>({ data: makeInvoices() }) as ReturnType<typeof useClienteFacturas>);
    render(
      <ClienteProfile
        customerId={CUSTOMER_ID}
        initialFechaInicio="2026-01-01"
        initialFechaFin="2026-06-30"
        backQuery="distribuidora"
      />,
    );

    expect(screen.getByRole("link", { name: "← Volver a clientes" })).toHaveAttribute(
      "href",
      "/dashboards/clientes?fecha_inicio=2026-01-01&fecha_fin=2026-06-30&q=distribuidora",
    );
  });

  it("shows a not-found state for a customer outside the active tenant", () => {
    useProfileMock.mockReturnValue(useMetricsResult<ClientePerfilResponse>({ error: new Error("API error 404 on profile") }) as ReturnType<typeof useClientePerfil>);
    render(<ClienteProfile customerId={CUSTOMER_ID} />);

    expect(screen.getByRole("alert")).toHaveTextContent("Cliente no encontrado");
    expect(screen.getByText(/negocio activo/)).toBeInTheDocument();
  });

  it("shows API errors and offers a retry", async () => {
    const user = userEvent.setup();
    const mutate = vi.fn();
    useProfileMock.mockReturnValue(useMetricsResult<ClientePerfilResponse>({ error: new Error("API error 500 on profile"), mutate }) as ReturnType<typeof useClientePerfil>);
    render(<ClienteProfile customerId={CUSTOMER_ID} />);

    expect(screen.getByRole("alert")).toHaveTextContent("No pudimos cargar el perfil");
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(mutate).toHaveBeenCalledOnce();
  });

  it("rejects an API response whose identity differs from the requested customer", () => {
    useProfileMock.mockReturnValue(useMetricsResult<ClientePerfilResponse>({
      data: makeProfile({ cliente: { customer_id: "999", nombre_canonico: "Otro cliente" } }),
    }) as ReturnType<typeof useClientePerfil>);
    render(<ClienteProfile customerId={CUSTOMER_ID} />);

    expect(screen.getByRole("alert")).toHaveTextContent("La respuesta no coincide");
  });

  it("paginates invoices and requests the next page", async () => {
    const user = userEvent.setup();
    const secondInvoice = { ...firstInvoice, fecha_negocio: "2026-09-11", num_documento: "A-101" };
    useProfileMock.mockReturnValue(useMetricsResult<ClientePerfilResponse>({ data: makeProfile() }) as ReturnType<typeof useClientePerfil>);
    useFacturasMock.mockImplementation((_id, _start, _end, page = 1) => useMetricsResult<ClienteFacturasResponse>({
      data: page === 1
        ? makeInvoices({ total: 21, total_paginas: 2, pagina: 1 })
        : makeInvoices({ items: [secondInvoice], total: 21, total_paginas: 2, pagina: 2 }),
    }) as ReturnType<typeof useClienteFacturas>);
    render(<ClienteProfile customerId={CUSTOMER_ID} />);

    await user.click(screen.getByRole("button", { name: "Siguiente" }));

    await waitFor(() => expect(useFacturasMock).toHaveBeenLastCalledWith(
      CUSTOMER_ID,
      expect.any(String),
      expect.any(String),
      2,
      20,
    ));
    const facturasPage2 = within(screen.getByRole("list", { name: "Facturas del cliente" }));
    expect(facturasPage2.getByRole("link", { name: "2026-09-11" })).toHaveAttribute(
      "href",
      "/dashboards/ventas/dia/2026-09-11",
    );
    expect(screen.getByRole("button", { name: "Siguiente" })).toBeDisabled();
  });
});