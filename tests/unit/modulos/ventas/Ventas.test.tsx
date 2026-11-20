import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TAMANO_PAGINA } from "@/compartido/lib/paginacion";
import { authDePrueba, perfilDePrueba, renderRuta } from "@tests/soporte/render";
import { argumentosDe, reiniciarSupabaseFalso, responder } from "@tests/soporte/supabase-falso";
import { turnoDePrueba } from "./datos";

vi.mock("@/compartido/lib/supabase", async () => ({
  supabase: (await import("@tests/soporte/supabase-falso")).supabaseFalso,
}));

const admin = () => authDePrueba({ perfil: perfilDePrueba({ rol: "admin" }) });
/** formatearMoneda separa "$" con un espacio duro. */
const normal = (texto: string | null) => (texto ?? "").replace(/\s/g, " ");

beforeEach(() => {
  reiniciarSupabaseFalso();
});

describe("Ventas (admin)", () => {
  it("lista los turnos con totales por medio, gastos y neto", async () => {
    responder("v_turnos", "select", {
      data: [turnoDePrueba(), turnoDePrueba({ id: 4, abierto: false, caja_nombre: "Caja 2" })],
    });
    renderRuta("/admin/ventas", admin());
    const fila = await screen.findByTestId("turno-5");
    const celdas = within(fila)
      .getAllByRole("cell")
      .map((c) => normal(c.textContent));
    expect(celdas).toEqual(expect.arrayContaining(["Caja 1", "Ana", "Abierto", "2"]));
    expect(celdas).toEqual(
      expect.arrayContaining([
        "$ 30.000,00",
        "$ 0,00",
        "$ 20.000,00",
        "$ 50.000,00",
        "$ 5.000,00",
        "$ 45.000,00",
      ]),
    );
    expect(screen.getByTestId("turno-4")).toHaveTextContent("Cerrado");
    expect(within(fila).getByRole("link", { name: /^Ver turno de Caja 1/ })).toHaveAttribute(
      "href",
      "/admin/ventas/turnos/5",
    );
    // Página incompleta: no hay más
    expect(screen.queryByRole("button", { name: "Ver más turnos" })).not.toBeInTheDocument();
  });

  it("sin turnos muestra el estado vacío", async () => {
    responder("v_turnos", "select", { data: [] });
    renderRuta("/admin/ventas", admin());
    expect(await screen.findByText("Todavía no se abrió ningún turno.")).toBeInTheDocument();
  });

  it("muestra el error de carga", async () => {
    responder("v_turnos", "select", { error: { code: "42501", message: "permission denied" } });
    renderRuta("/admin/ventas", admin());
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("'Ver más' pide los turnos anteriores al último por cursor (no por posición)", async () => {
    const pagina = Array.from({ length: TAMANO_PAGINA }, (_, i) => turnoDePrueba({ id: 500 - i }));
    responder("v_turnos", "select", { data: pagina });
    renderRuta("/admin/ventas", admin());
    await screen.findByTestId("turno-500");
    expect(argumentosDe("v_turnos", "select", "lt")).toBeUndefined();
    expect(argumentosDe("v_turnos", "select", "order")).toEqual(["id", { ascending: false }]);

    responder("v_turnos", "select", { data: [turnoDePrueba({ id: 7 })] });
    await userEvent.click(screen.getByRole("button", { name: "Ver más turnos" }));
    expect(await screen.findByTestId("turno-7")).toBeInTheDocument();
    expect(argumentosDe("v_turnos", "select", "lt")).toEqual(["id", 500 - TAMANO_PAGINA + 1]);
    expect(screen.queryByRole("button", { name: "Ver más turnos" })).not.toBeInTheDocument();
  });
});
