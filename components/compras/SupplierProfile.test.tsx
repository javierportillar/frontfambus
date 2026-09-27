import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  useComprasProveedorPerfil,
  type ComprasProveedorPerfilResponse,
} from "@/lib/api/hooks";
import { SupplierProfile } from "./SupplierProfile";

vi.mock("@/lib/api/hooks", () => ({ useComprasProveedorPerfil: vi.fn() }));

const NIT = "1116274616";
const firstDocument = {
  business_date: "2026-09-10",
  cod_clase: "FC",
  num_documento: "A-100",
  total_factura: 125000,
  num_items: 3,
};

function makeProfile(overrides: Partial<ComprasProveedorPerfilResponse> = {}): ComprasProveedorPerfilResponse {
  return {
    proveedor: { nit: NIT, nombre: "Distribuidora Norte" },
    periodo: { fecha_inicio: "2025-09-27", fecha_fin: "2026-09-27" },
    compras: {
      total_compras: 125000,
      num_documentos: 1,
      ticket_promedio: 125000,
      primera_compra: "2026-09-10",
      ultima_compra: "2026-09-10",
      skus_distintos: 3,
      productos_top: [],
    },
    ventas_estimadas: {
      revenue: 240000,
      revenue_with_cost: 240000,
      margen_cobertura_pct: 100,
      margen: 85000,
      margen_pct: 35.4,
      skus_vendidos: 3,
      skus_con_costo: 3,
      metodo_atribucion: {
        id: "latest_supplier_per_sku",
        descripcion: "Atribuye cada SKU al proveedor conocido de su compra más reciente.",
      },
    },
    documentos: [firstDocument],
    paginacion: { page: 1, page_size: 20, total_documentos: 1, has_more: false },
    ...overrides,
  };
}

function result(overrides: Partial<ReturnType<typeof useComprasProveedorPerfil>> = {}) {
  return {
    data: undefined,
    error: undefined,
    isLoading: false,
    isValidating: false,
    mutate: vi.fn(),
    ...overrides,
  } as ReturnType<typeof useComprasProveedorPerfil>;
}

const useProfileMock = vi.mocked(useComprasProveedorPerfil);

describe("SupplierProfile", () => {
  afterEach(() => vi.useRealTimers());

  beforeEach(() => {
    vi.clearAllMocks();
    useProfileMock.mockReturnValue(result({ isLoading: true }));
  });

  it("shows a loading state while the profile request is pending", () => {
    render(<SupplierProfile nit={NIT} />);

    expect(screen.getByRole("status", { name: "Cargando perfil del proveedor" })).toBeInTheDocument();
    expect(useProfileMock).toHaveBeenCalledWith(NIT, expect.any(String), expect.any(String), 1, 20);
  });

  it("defaults the date filters to the previous twelve months", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-27T18:00:00.000Z"));
    const { unmount } = render(<SupplierProfile nit={NIT} />);

    expect(screen.getByLabelText("Desde")).toHaveValue("2025-09-27");
    expect(screen.getByLabelText("Hasta")).toHaveValue("2026-09-27");
    expect(useProfileMock).toHaveBeenCalledWith(NIT, "2025-09-27", "2026-09-27", 1, 20);

    unmount();
    vi.useRealTimers();
  });

  it("does not request an invalid NIT and shows a validation state", () => {
    render(<SupplierProfile nit="bad-nit" />);

    expect(screen.getByRole("alert")).toHaveTextContent("NIT inválido");
    expect(useProfileMock).toHaveBeenCalledWith(null, expect.any(String), expect.any(String), 1, 20);
  });

  it("renders empty purchase history without hiding the estimates or attribution method", () => {
    const data = makeProfile({
      compras: {
        total_compras: 0,
        num_documentos: 0,
        ticket_promedio: 0,
        primera_compra: null,
        ultima_compra: null,
        skus_distintos: 0,
        productos_top: [],
      },
      documentos: [],
      paginacion: { page: 1, page_size: 20, total_documentos: 0, has_more: false },
    });
    useProfileMock.mockReturnValue(result({ data }));
    render(<SupplierProfile nit={NIT} />);

    expect(screen.getByRole("heading", { name: "Compras al proveedor" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ventas y margen estimados" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("No hay documentos de compra");
    expect(screen.getByText("Método de atribución: latest_supplier_per_sku")).toBeInTheDocument();
    expect(screen.getByText(/No representa ventas facturadas directamente por este proveedor/)).toBeInTheDocument();
  });

  it("shows the supplier's top purchased products separately from estimated sales", () => {
    useProfileMock.mockReturnValue(result({
      data: makeProfile({
        compras: {
          total_compras: 125000,
          num_documentos: 1,
          ticket_promedio: 125000,
          primera_compra: "2026-09-10",
          ultima_compra: "2026-09-10",
          skus_distintos: 1,
          productos_top: [{
            cod_producto: "SKU-1",
            nombre: "Alpha product",
            unidades: 3,
            total_compras: 125000,
            documentos: 1,
          }],
        },
      }),
    }));
    render(<SupplierProfile nit={NIT} />);

    expect(screen.getByRole("heading", { name: "Productos más comprados" })).toBeInTheDocument();
    expect(screen.getByText("Alpha product")).toBeInTheDocument();
    expect(screen.getByText("Ventas y margen estimados")).toBeInTheDocument();
  });

  it("shows API errors and offers a retry", async () => {
    const user = userEvent.setup();
    const mutate = vi.fn();
    useProfileMock.mockReturnValue(result({ error: new Error("API error 500 on profile"), mutate }));
    render(<SupplierProfile nit={NIT} />);

    expect(screen.getByRole("alert")).toHaveTextContent("No pudimos cargar el perfil");
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(mutate).toHaveBeenCalledOnce();
  });

  it("renders a not-found state for a supplier outside the active tenant", () => {
    useProfileMock.mockReturnValue(result({ error: new Error("API error 404 on profile") }));
    render(<SupplierProfile nit={NIT} />);

    expect(screen.getByRole("alert")).toHaveTextContent("Proveedor no encontrado");
    expect(screen.getByText(/negocio activo/)).toBeInTheDocument();
  });

  it("paginates bounded documents and links each exact date/class/number identity", async () => {
    const user = userEvent.setup();
    const secondDocument = { ...firstDocument, business_date: "2026-09-11", num_documento: "A-101" };
    useProfileMock.mockImplementation((_nit, _start, _end, page = 1) => result({
      data: page === 1
        ? makeProfile({
            paginacion: { page: 1, page_size: 20, total_documentos: 21, has_more: true },
          })
        : makeProfile({
            documentos: [secondDocument],
            paginacion: { page: 2, page_size: 20, total_documentos: 21, has_more: false },
          }),
    }));
    render(<SupplierProfile nit={NIT} />);

    expect(screen.getByRole("link", { name: "Factura A-100" })).toHaveAttribute(
      "href",
      "/dashboards/compras/dia/2026-09-10/documento/A-100?cod_clase=FC",
    );
    await user.click(screen.getByRole("button", { name: "Siguiente" }));

    await waitFor(() => expect(useProfileMock).toHaveBeenLastCalledWith(
      NIT,
      expect.any(String),
      expect.any(String),
      2,
      20,
    ));
    expect(screen.getByRole("link", { name: "Factura A-101" })).toHaveAttribute(
      "href",
      "/dashboards/compras/dia/2026-09-11/documento/A-101?cod_clase=FC",
    );
    expect(screen.getByRole("button", { name: "Siguiente" })).toBeDisabled();
  });

  it("rejects an API response whose supplier identity differs from the requested NIT", () => {
    useProfileMock.mockReturnValue(result({
      data: makeProfile({ proveedor: { nit: "2222222222", nombre: "Otro proveedor" } }),
    }));
    render(<SupplierProfile nit={NIT} />);

    expect(screen.getByRole("alert")).toHaveTextContent("La respuesta no coincide");
  });
});
