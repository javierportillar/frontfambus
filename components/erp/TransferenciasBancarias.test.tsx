import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";
import { canAccessPath } from "@/lib/auth/access";
import { useAuthStore } from "@/lib/auth/store";
import {
  applyBankMovement,
  listBankCandidates,
  listBankMovements,
  type BankMovimiento,
} from "@/lib/erp/bank";
import { TransferenciasBancarias } from "./TransferenciasBancarias";

vi.mock("@/lib/erp/bank", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/erp/bank")>();
  return {
    ...actual,
    listBankMovements: vi.fn(),
    listBankCandidates: vi.fn(),
    applyBankMovement: vi.fn(),
  };
});

const MOV_AMBIGUA: BankMovimiento = {
  id: "mov-a",
  fecha: "2026-10-20",
  valor: "150000.00",
  descripcion: "PAGO QR NIT 900123456",
  // La referencia trae un carácter de control: la tabla debe sanearlo.
  referencia: "0092055984\u0007",
  pagadorNombre: "DISTRIBUIDORA EL SOL",
  estado: "AMBIGUA",
  reciboNumero: null,
  confianza: 80,
  razones: "referencia exacta (100) + NIT del pagador (80)",
};

const MOV_APLICADO: BankMovimiento = {
  ...MOV_AMBIGUA,
  id: "mov-b",
  descripcion: "PAGO QR APLICADO",
  estado: "APLICADO",
  reciboNumero: "0002",
};

const MOV_OTRO_DIA: BankMovimiento = {
  ...MOV_AMBIGUA,
  id: "mov-c",
  fecha: "2026-10-18",
  descripcion: "TRANSFERENCIA",
  referencia: "7777777",
  estado: "PENDIENTE",
};

const CANDIDATO = {
  id: "F-1",
  valor: "150000.00",
  pagadorNombre: "DISTRIBUIDORA EL SOL",
  referencia: "0092055984",
  fecha: "2026-10-20",
};

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function renderizar(): void {
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <TransferenciasBancarias />
    </SWRConfig>,
  );
}

function filaDe(descripcion: string): HTMLElement {
  const celda = screen.getByText(descripcion);
  const fila = celda.closest("tr");
  if (!fila) throw new Error(`No se encontró la fila de ${descripcion}`);
  return fila;
}

beforeEach(() => {
  vi.mocked(listBankMovements).mockReset();
  vi.mocked(listBankCandidates).mockReset();
  vi.mocked(applyBankMovement).mockReset();
  useAuthStore.setState({ currentTenant: "motoshop" });
});

describe("TransferenciasBancarias · listado", () => {
  it("test_fila_de_movimiento_muestra_fecha_descripcion_referencia_saneada_importe_pagador_estado_y_factura", async () => {
    vi.mocked(listBankMovements).mockResolvedValue([MOV_AMBIGUA]);

    renderizar();

    const fila = await screen.findByText("PAGO QR NIT 900123456");
    const celdas = within(fila.closest("tr") as HTMLElement).getAllByRole(
      "cell",
    );
    expect(celdas[0]).toHaveTextContent("2026-10-20");
    expect(celdas[1]).toHaveTextContent("PAGO QR NIT 900123456");
    expect(celdas[2]).toHaveTextContent("0092055984");
    expect(celdas[2]?.textContent).not.toContain("\u0007");
    expect(celdas[3]).toHaveTextContent("150000.00");
    expect(celdas[4]).toHaveTextContent("DISTRIBUIDORA EL SOL");
    expect(celdas[5]).toHaveTextContent("Ambigua");
    // Sin documento todavía: se pinta el guion, no una celda vacía.
    expect(celdas[6]).toHaveTextContent("—");
  });

  it("test_filtro_por_estado_muestra_solo_los_movimientos_de_ese_estado", async () => {
    vi.mocked(listBankMovements).mockResolvedValue([MOV_AMBIGUA, MOV_APLICADO]);
    const user = userEvent.setup();

    renderizar();
    await screen.findByText("PAGO QR NIT 900123456");

    await user.selectOptions(
      screen.getByLabelText("Filtrar por estado"),
      "APLICADO",
    );

    const tabla = within(screen.getByRole("table"));
    expect(tabla.getByText("Aplicado")).toBeInTheDocument();
    expect(tabla.queryByText("Ambigua")).not.toBeInTheDocument();
  });

  it("test_filtro_por_rango_de_fechas_muestra_solo_los_movimientos_del_rango", async () => {
    vi.mocked(listBankMovements).mockResolvedValue([MOV_AMBIGUA, MOV_OTRO_DIA]);
    const user = userEvent.setup();

    renderizar();
    await screen.findByText("PAGO QR NIT 900123456");

    await user.type(screen.getByLabelText("Filtrar desde"), "2026-10-19");

    expect(screen.getByText("PAGO QR NIT 900123456")).toBeInTheDocument();
    expect(screen.queryByText("TRANSFERENCIA")).not.toBeInTheDocument();
  });

  it("test_fallo_del_backend_muestra_estado_de_error_y_no_una_lista_vacia", async () => {
    vi.mocked(listBankMovements).mockRejectedValue(new Error("500"));

    renderizar();

    expect(
      await screen.findByText("No se pudieron cargar los movimientos"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Sin movimientos")).not.toBeInTheDocument();
  });

  it("test_lista_vacia_se_muestra_como_estado_vacio_y_no_como_error", async () => {
    vi.mocked(listBankMovements).mockResolvedValue([]);

    renderizar();

    expect(await screen.findByText("Sin movimientos")).toBeInTheDocument();
    expect(
      screen.queryByText("No se pudieron cargar los movimientos"),
    ).not.toBeInTheDocument();
  });
});

describe("TransferenciasBancarias · resolución manual", () => {
  it("test_aplicacion_manual_a_una_factura_elegida_refleja_el_nuevo_estado_y_la_factura", async () => {
    vi.mocked(listBankMovements)
      .mockResolvedValueOnce([MOV_AMBIGUA])
      .mockResolvedValue([
        { ...MOV_AMBIGUA, estado: "APLICADO", reciboNumero: "0002" },
      ]);
    vi.mocked(listBankCandidates).mockResolvedValue({
      ambiguo: false,
      ventana: { desde: "2026-10-20", hasta: "2026-10-20" },
      candidatos: [CANDIDATO],
      ultimaIngestaAt: "2026-10-20T12:00:00",
    });
    vi.mocked(applyBankMovement).mockResolvedValue({
      movimientoId: MOV_AMBIGUA.id,
      documento: "0002",
      prefijo: "S01",
      replay: false,
    });
    const user = userEvent.setup();

    renderizar();
    await screen.findByText("PAGO QR NIT 900123456");

    await user.click(screen.getByRole("button", { name: "Aplicar" }));
    await user.click(
      screen.getByRole("button", { name: "Buscar facturas candidatas" }),
    );
    await user.click(await screen.findByRole("radio", { name: /F-1/ }));
    await user.click(
      screen.getByRole("button", { name: "Confirmar aplicación" }),
    );

    await waitFor(() => expect(applyBankMovement).toHaveBeenCalledTimes(1));
    const [movimientoId, input] = vi.mocked(applyBankMovement).mock.calls[0] ?? [];
    expect(movimientoId).toBe(MOV_AMBIGUA.id);
    expect(input?.facturaId).toBe("F-1");
    expect(input?.idempotencyKey).toMatch(UUID_V4);

    await waitFor(() =>
      expect(filaDe("PAGO QR NIT 900123456")).toHaveTextContent("Aplicado"),
    );
    expect(filaDe("PAGO QR NIT 900123456")).toHaveTextContent("0002");
  });

  it("test_un_movimiento_ya_aplicado_no_ofrece_la_accion_de_aplicar", async () => {
    vi.mocked(listBankMovements).mockResolvedValue([MOV_APLICADO]);

    renderizar();
    await screen.findByText("PAGO QR APLICADO");

    expect(
      screen.queryByRole("button", { name: "Aplicar" }),
    ).not.toBeInTheDocument();
  });

  it("test_solo_se_listan_movimientos_del_tenant_actual", async () => {
    vi.mocked(listBankMovements).mockResolvedValue([MOV_AMBIGUA]);

    renderizar();
    await screen.findByText("PAGO QR NIT 900123456");
    expect(listBankMovements).toHaveBeenCalledTimes(1);

    // Al cambiar de tenant la lista se vuelve a pedir: no se reusa la ajena.
    useAuthStore.getState().setTenant("masvital", []);

    await waitFor(() => expect(listBankMovements).toHaveBeenCalledTimes(2));
  });
});

describe("TransferenciasBancarias · permisos", () => {
  it("test_usuario_sin_permiso_de_cobranzas_no_alcanza_la_pagina", () => {
    expect(
      canAccessPath("/banco/transferencias", {
        role: "vendedor",
        enabledFeatures: [],
        allowedModules: ["pos"],
      }),
    ).toBe(false);
    expect(
      canAccessPath("/banco/transferencias", {
        role: "gerente",
        enabledFeatures: ["bank-reconciliation"],
        allowedModules: ["bank-reconciliation"],
      }),
    ).toBe(true);
  });
});
