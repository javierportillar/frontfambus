import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { DianStatusBadge } from "./DianStatusBadge";

describe("DianStatusBadge", () => {
  it("renders ACCEPTED status with green styling and label", () => {
    render(<DianStatusBadge status="ACCEPTED" />);
    expect(screen.getByText("Aceptada DIAN")).toBeDefined();
  });

  it("renders PENDING status with En Cola DIAN label", () => {
    render(<DianStatusBadge status="PENDING" />);
    expect(screen.getByText("En Cola DIAN")).toBeDefined();
  });

  it("renders FAILED status with Error Transmisión label", () => {
    render(<DianStatusBadge status="FAILED" />);
    expect(screen.getByText("Error Transmisión")).toBeDefined();
  });

  it("renders REJECTED status with Rechazada DIAN label", () => {
    render(<DianStatusBadge status="REJECTED" />);
    expect(screen.getByText("Rechazada DIAN")).toBeDefined();
  });

  it("renders CANCELLED status with Cancelada label", () => {
    render(<DianStatusBadge status="CANCELLED" />);
    expect(screen.getByText("Cancelada")).toBeDefined();
  });

  it("handles unknown status gracefully", () => {
    render(<DianStatusBadge status="CUSTOM_STATUS" />);
    expect(screen.getByText("Desconocido")).toBeDefined();
  });
});
