import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { BankCandidato } from "@/lib/erp/bank";
import type { EstadoSesion } from "./useColaVerificacion";
import { BankVerifyModal } from "./BankVerifyModal";

const CANDIDATO: BankCandidato = {
  id: "cand-1",
  valor: "42000.00",
  pagadorNombre: "LEDER ARMA",
  referencia: "0092405445",
  fecha: "2026-10-24",
};

type Props = Partial<React.ComponentProps<typeof BankVerifyModal>>;

function montar(props: Props = {}) {
  return render(
    <BankVerifyModal
      open
      onClose={() => undefined}
      valor={42000}
      fecha="2026-10-24"
      referencia="FVP-3679"
      posicion={null}
      total={0}
      onVerificar={() => undefined}
      {...props}
    />,
  );
}

describe("BankVerifyModal", () => {
  it("sin pedido todavía, ofrece iniciar la consulta", () => {
    const onVerificar = vi.fn();
    montar({ onVerificar });

    fireEvent.click(screen.getByRole("button", { name: /verificar en el banco/i }));

    expect(onVerificar).toHaveBeenCalledTimes(1);
  });

  it("en cola avisa que arranca sola y no deja disparar otra", () => {
    const sesion: EstadoSesion = { estado: "en_cola", jobId: null };
    const onVerificar = vi.fn();
    montar({ sesion, posicion: 2, total: 2, onVerificar });

    const aviso = screen.getByTestId("bank-verify-en-cola");
    expect(aviso.textContent).toContain("Posición 2 de 2");
    const boton = screen.getByRole("button", { name: /en cola/i });
    expect((boton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(boton);
    expect(onVerificar).not.toHaveBeenCalled();
  });

  it("muestra la etapa y el porcentaje que publica el nodo", () => {
    const sesion: EstadoSesion = {
      estado: "consultando",
      jobId: "job-1",
      paso: "cuenta_abierta",
      pct: 55,
    };
    montar({ sesion, posicion: 1, total: 1 });

    const progreso = screen.getByTestId("bank-verify-progreso");
    expect(progreso.textContent).toContain("Cuenta encontrada");
    expect(progreso.textContent).toContain("55%");
    // Las etapas anteriores quedan marcadas como cumplidas.
    expect(progreso.textContent).toContain("✓ Sesión del banco iniciada");
  });

  it("con el pago encontrado muestra pagador, valor y referencia", () => {
    const sesion: EstadoSesion = {
      estado: "resuelto",
      jobId: "job-1",
      pct: 100,
      candidato: CANDIDATO,
    };
    montar({ sesion, posicion: 1, total: 1 });

    const bloque = screen.getByTestId("bank-verify-confirmation");
    expect(bloque.textContent).toContain("LEDER ARMA");
    expect(bloque.textContent).toContain("0092405445");
    expect(bloque.textContent).toContain("42.000");
  });

  it("sin coincidencia nombra el valor y el día consultado", () => {
    const sesion: EstadoSesion = {
      estado: "sin_coincidencia",
      jobId: "job-1",
      pct: 100,
    };
    montar({ sesion, posicion: null, total: 0 });

    const aviso = screen.getByRole("status");
    expect(aviso.textContent).toContain("42.000");
    expect(aviso.textContent).toMatch(/24 de octubre/i);
  });

  it("un fallo muestra el mensaje estable del nodo", () => {
    const sesion: EstadoSesion = {
      estado: "fallido",
      jobId: null,
      error: "La PC del banco no está en línea.",
    };
    montar({ sesion, posicion: null, total: 0 });

    expect(screen.getByRole("alert").textContent).toContain(
      "La PC del banco no está en línea.",
    );
  });

  it("cerrado no renderiza nada", () => {
    montar({ open: false });
    expect(screen.queryByTestId("bank-verify-modal")).toBeNull();
  });
});
