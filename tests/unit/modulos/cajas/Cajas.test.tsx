import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Cajas } from "@/modulos/cajas/paginas/Cajas";
import { renderConQuery } from "@tests/soporte/render";
import { argumentosDe, reiniciarSupabaseFalso, responder } from "@tests/soporte/supabase-falso";

vi.mock("@/compartido/lib/supabase", async () => ({
  supabase: (await import("@tests/soporte/supabase-falso")).supabaseFalso,
}));

beforeEach(() => {
  reiniciarSupabaseFalso();
});

describe("Cajas", () => {
  it("lista las cajas con su estado", async () => {
    responder("cajas", "select", {
      data: [
        { id: 1, nombre: "Caja 1", activa: true },
        { id: 2, nombre: "Caja vieja", activa: false },
      ],
    });
    renderConQuery(<Cajas />);
    expect(await screen.findByRole("switch", { name: "Caja Caja 1 activa" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "Caja Caja vieja activa" })).not.toBeChecked();
  });

  it("sin cajas muestra cómo empezar", async () => {
    responder("cajas", "select", { data: [] });
    renderConQuery(<Cajas />);
    expect(await screen.findByText(/Todavía no hay cajas/)).toBeInTheDocument();
  });

  it("muestra el error de carga traducido", async () => {
    responder("cajas", "select", { error: { code: "PGRST301", message: "JWT expired" } });
    renderConQuery(<Cajas />);
    expect(await screen.findByText("Tu sesión venció. Ingresá de nuevo.")).toBeInTheDocument();
  });

  it("crea una caja", async () => {
    responder("cajas", "select", { data: [] });
    responder("cajas", "insert", { data: { id: 3, nombre: "Caja 3", activa: true } });
    renderConQuery(<Cajas />);
    await userEvent.click(await screen.findByRole("button", { name: "Nueva caja" }));
    await userEvent.type(screen.getByLabelText("Nombre"), "Caja 3");
    await userEvent.click(screen.getByRole("button", { name: "Crear caja" }));
    await vi.waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(argumentosDe("cajas", "insert")).toEqual([{ nombre: "Caja 3" }]);
  });
});
