import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authDePrueba, perfilDePrueba, renderRuta } from "@tests/soporte/render";
import {
  argumentosRpc,
  reiniciarSupabaseFalso,
  responder,
  responderRpc,
} from "@tests/soporte/supabase-falso";
import { turnoDePrueba, ventaDePrueba } from "./datos";

vi.mock("@/compartido/lib/supabase", async () => ({
  supabase: (await import("@tests/soporte/supabase-falso")).supabaseFalso,
}));

const admin = () => authDePrueba({ perfil: perfilDePrueba({ rol: "admin" }) });
const normal = (texto: string | null) => (texto ?? "").replace(/\s/g, " ");

beforeEach(() => {
  reiniciarSupabaseFalso();
  responder("ventas", "select", {
    data: [
      ventaDePrueba({ id: 82, medio_pago: "tarjeta", precio: 20000 }),
      ventaDePrueba({ id: 81, anulada: true, anulada_motivo: "Duplicada" }),
    ],
  });
});

describe("DetalleTurno (admin)", () => {
  it("muestra los totales, las observaciones y deja anular solo las ventas vigentes", async () => {
    responder("v_turnos", "select", {
      data: turnoDePrueba({
        abierto: false,
        cerrado_en: "2026-11-20T20:00:00Z",
        observaciones: "Sin novedad",
      }),
    });
    renderRuta("/admin/ventas/turnos/5", admin());

    expect(normal((await screen.findByTestId("total-Neto")).textContent)).toBe("$ 45.000,00");
    expect(normal(screen.getByTestId("total-Tarjeta").textContent)).toBe("$ 20.000,00");
    expect(normal(screen.getByTestId("total-Gastos").textContent)).toBe("$ 5.000,00");
    expect(screen.getByText("Observaciones: Sin novedad")).toBeInTheDocument();
    // Cerrado: no se puede volver a cerrar
    expect(screen.queryByRole("button", { name: "Cerrar turno" })).not.toBeInTheDocument();

    expect(
      within(screen.getByTestId("venta-82")).getByRole("button", { name: "Anular venta N° 82" }),
    ).toBeInTheDocument();
    expect(within(screen.getByTestId("venta-81")).queryByRole("button")).not.toBeInTheDocument();

    responderRpc("anular_venta", { data: { id: 82, anulada: true } });
    await userEvent.click(screen.getByRole("button", { name: "Anular venta N° 82" }));
    const dialogo = screen.getByRole("dialog", { name: "Anular venta N° 82" });
    await userEvent.type(within(dialogo).getByLabelText("Motivo"), "Error de cobro");
    await userEvent.click(within(dialogo).getByRole("button", { name: "Anular venta" }));
    await vi.waitFor(() => {
      expect(argumentosRpc("anular_venta")).toEqual({ p_venta_id: 82, p_motivo: "Error de cobro" });
    });
  });

  it("cierra el turno ajeno que quedó abierto (sin observaciones no las manda)", async () => {
    responder("v_turnos", "select", { data: turnoDePrueba() });
    responderRpc("cerrar_turno", { data: { id: 5 } });
    renderRuta("/admin/ventas/turnos/5", admin());

    await userEvent.click(await screen.findByRole("button", { name: "Cerrar turno" }));
    const dialogo = screen.getByRole("dialog", { name: "Cerrar turno" });
    await userEvent.click(within(dialogo).getByRole("button", { name: "Cerrar turno" }));
    await vi.waitFor(() => {
      expect(argumentosRpc("cerrar_turno")).toEqual({ p_turno_id: 5 });
    });
  });

  it("un turno inexistente o un id inválido lo dicen", async () => {
    responder("v_turnos", "select", { data: null });
    const { unmount } = renderRuta("/admin/ventas/turnos/999", admin());
    expect(await screen.findByText("El turno no existe.")).toBeInTheDocument();
    unmount();
    renderRuta("/admin/ventas/turnos/abc", admin());
    expect(await screen.findByText("El turno no existe.")).toBeInTheDocument();
  });

  it("muestra el error de carga", async () => {
    responder("v_turnos", "select", { error: { code: "42501", message: "permission denied" } });
    renderRuta("/admin/ventas/turnos/5", admin());
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
