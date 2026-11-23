import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CertificadoConStock } from "@/modulos/certificados/api/consultas";
import { TablaStock } from "@/modulos/certificados/componentes/TablaStock";
import { renderConQuery } from "@tests/soporte/render";
import { argumentosDe, reiniciarSupabaseFalso, responder } from "@tests/soporte/supabase-falso";
import { certificadoDePrueba } from "./datos";

vi.mock("@/compartido/lib/supabase", async () => ({
  supabase: (await import("@tests/soporte/supabase-falso")).supabaseFalso,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderTabla(certificados: CertificadoConStock[]) {
  const onAccion = vi.fn();
  const router = createMemoryRouter(
    [{ path: "/", element: <TablaStock certificados={certificados} onAccion={onAccion} /> }],
    { initialEntries: ["/"] },
  );
  renderConQuery(<RouterProvider router={router} />);
  return onAccion;
}

beforeEach(() => {
  reiniciarSupabaseFalso();
  vi.mocked(toast.error).mockClear();
  vi.mocked(toast.success).mockClear();
});

describe("TablaStock", () => {
  it("muestra stock, estado, valor y el enlace a movimientos", () => {
    renderTabla([
      certificadoDePrueba({
        stock_hojas: 1250,
        semaforo: "ok",
        costo_promedio: 2000,
        valor_stock: 2500000,
      }),
    ]);
    const fila = screen.getByTestId("certificado-Hoja VTV");
    expect(fila).toHaveTextContent("1.250");
    expect(fila).toHaveTextContent("OK");
    expect(fila).toHaveTextContent("2.000,00");
    expect(fila).toHaveTextContent("2.500.000,00");
    expect(screen.getByRole("link", { name: "Movimientos de Hoja VTV" })).toHaveAttribute(
      "href",
      "/4",
    );
  });

  it("los botones avisan la acción con el certificado", async () => {
    const onAccion = renderTabla([certificadoDePrueba()]);
    await userEvent.click(screen.getByRole("button", { name: "Ajuste de stock de Hoja VTV" }));
    expect(onAccion).toHaveBeenCalledWith("ajustar", expect.objectContaining({ id: 4 }));
    await userEvent.click(screen.getByRole("button", { name: "Registrar compra de Hoja VTV" }));
    expect(onAccion).toHaveBeenCalledWith("comprar", expect.objectContaining({ id: 4 }));
  });

  it("un certificado desactivado no permite registrar compras", () => {
    renderTabla([certificadoDePrueba({ activo: false })]);
    expect(screen.getByRole("button", { name: "Registrar compra de Hoja VTV" })).toBeDisabled();
    expect(screen.getByText("Desactivado: activalo para registrar compras.")).toBeInTheDocument();
  });

  it("al activar, explica el choque con otro certificado activo del mismo destino", async () => {
    responder("certificados", "update", {
      error: {
        code: "23505",
        message: 'duplicate key value violates unique constraint "certificados_uno_por_servicio"',
      },
    });
    renderTabla([certificadoDePrueba({ activo: false, alcance: "servicio", servicio_id: 5 })]);
    await userEvent.click(screen.getByRole("switch", { name: "Certificado Hoja VTV activo" }));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "Ese servicio ya tiene un certificado activo. Desactivalo antes de activar otro.",
      );
    });
    expect(argumentosDe("certificados", "update")).toEqual([{ activo: true }]);
    expect(toast.success).not.toHaveBeenCalled();
  });
});
