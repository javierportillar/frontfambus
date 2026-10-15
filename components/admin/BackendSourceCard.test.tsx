import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BackendSourceCard } from "./BackendSourceCard";
import * as hooks from "@/lib/api/hooks";
import { useAuthStore } from "@/lib/auth/store";

vi.mock("@/lib/api/hooks", () => ({
  useBackendStatus: vi.fn(),
}));

describe("BackendSourceCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ currentTenant: "motoshop" });
  });

  it("renders loading skeleton when status is loading without cached data", () => {
    vi.mocked(hooks.useBackendStatus).mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      isValidating: false,
      mutate: vi.fn(),
    });

    const { container } = render(<BackendSourceCard />);
    expect(container.querySelectorAll(".animate-pulse, [aria-hidden='true']").length).toBeGreaterThan(0);
  });

  it("displays prominent active node for Render primary", () => {
    const mutate = vi.fn();
    vi.mocked(hooks.useBackendStatus).mockReturnValue({
      data: {
        activeNode: {
          id: "render",
          name: "Render (Nube)",
          url: "https://api.fragloesja.uk",
          isPrimary: true,
        },
        currentTenant: "motoshop",
        nodes: [
          {
            id: "render",
            name: "Render (Nube)",
            url: "https://api.fragloesja.uk",
            isPrimary: true,
            status: "online",
            statusCode: 200,
            latencyMs: 85,
            isActive: true,
          },
          {
            id: "motoshop",
            name: "PC MotoShop (Local)",
            url: "https://motoshop-local.fragloesja.uk",
            isPrimary: false,
            status: "online",
            statusCode: 200,
            latencyMs: 12,
            isActive: false,
          },
          {
            id: "masvital",
            name: "PC MasVital (Local)",
            url: "https://masvital-local.fragloesja.uk",
            isPrimary: false,
            status: "offline",
            statusCode: null,
            latencyMs: null,
            isActive: false,
          },
        ],
        checkedAt: "2026-10-15T18:00:00.000Z",
      },
      error: undefined,
      isLoading: false,
      isValidating: false,
      mutate,
    });

    render(<BackendSourceCard />);

    expect(screen.getByText(/Conectado activamente a:/i)).toBeInTheDocument();
    expect(screen.getAllByText("Render (Nube)").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("PC MotoShop (Local)")).toBeInTheDocument();
    expect(screen.getByText("PC MasVital (Local)")).toBeInTheDocument();
    expect(screen.getByText("MotoShop")).toBeInTheDocument();
    expect(screen.getByText("Activo")).toBeInTheDocument();

    const refreshBtn = screen.getByRole("button", { name: /actualizar/i });
    fireEvent.click(refreshBtn);
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("displays prominent active node when failed over to PC MasVital (Local)", () => {
    useAuthStore.setState({ currentTenant: "masvital" });

    vi.mocked(hooks.useBackendStatus).mockReturnValue({
      data: {
        activeNode: {
          id: "masvital",
          name: "PC MasVital (Local)",
          url: "https://masvital-local.fragloesja.uk",
          isPrimary: false,
        },
        currentTenant: "masvital",
        nodes: [
          {
            id: "render",
            name: "Render (Nube)",
            url: "https://api.fragloesja.uk",
            isPrimary: true,
            status: "suspended",
            statusCode: 503,
            latencyMs: 140,
            isActive: false,
          },
          {
            id: "motoshop",
            name: "PC MotoShop (Local)",
            url: "https://motoshop-local.fragloesja.uk",
            isPrimary: false,
            status: "online",
            statusCode: 200,
            latencyMs: 18,
            isActive: false,
          },
          {
            id: "masvital",
            name: "PC MasVital (Local)",
            url: "https://masvital-local.fragloesja.uk",
            isPrimary: false,
            status: "online",
            statusCode: 200,
            latencyMs: 8,
            isActive: true,
          },
        ],
        checkedAt: "2026-10-15T18:00:00.000Z",
      },
      error: undefined,
      isLoading: false,
      isValidating: false,
      mutate: vi.fn(),
    });

    render(<BackendSourceCard />);

    expect(screen.getByText(/Conectado activamente a:/i)).toBeInTheDocument();
    expect(screen.getAllByText("PC MasVital (Local)").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("MasVital")).toBeInTheDocument();
    expect(screen.getByText("Suspendido [503]")).toBeInTheDocument();
    expect(screen.getByText("Activo")).toBeInTheDocument();
  });
});
