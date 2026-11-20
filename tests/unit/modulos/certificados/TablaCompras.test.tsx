import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TablaCompras } from "@/modulos/certificados/componentes/TablaCompras";
import { renderConQuery } from "@tests/soporte/render";
import { reiniciarSupabaseFalso, responder } from "@tests/soporte/supabase-falso";
import { compraDePrueba } from "./datos";

vi.mock("@/compartido/lib/supabase", async () => ({
  supabase: (await import("@tests/soporte/supabase-falso")).supabaseFalso,
}));

beforeEach(() => {
  reiniciarSupabaseFalso();
});

describe("TablaCompras", () => {
  it("solo ofrece editar las compras que la BD marca como editables", async () => {
    const editable = compraDePrueba({ id: 13 });
    responder("v_compras_certificado", "select", {
      data: [
        editable,
        compraDePrueba({ id: 11, editable: false }),
        compraDePrueba({
          id: 10,
          editable: false,
          anulada: true,
          anulada_motivo: "Se cargó mal",
          anulada_por: "Admin",
          reemplazada_por: 11,
        }),
      ],
    });
    const onEditar = vi.fn();
    renderConQuery(<TablaCompras onEditar={onEditar} />);

    const botones = await screen.findAllByRole("button", { name: /^Editar compra/ });
    expect(botones).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "Editar compra #13" }));
    expect(onEditar).toHaveBeenCalledWith(editable);
  });

  it("muestra la compra corregida tachada, con motivo y reemplazo", async () => {
    responder("v_compras_certificado", "select", {
      data: [
        compraDePrueba({
          id: 10,
          editable: false,
          anulada: true,
          anulada_motivo: "Se cargó mal",
          anulada_por: "Admin",
          reemplazada_por: 11,
        }),
      ],
    });
    renderConQuery(<TablaCompras onEditar={vi.fn()} />);
    const fila = await screen.findByTestId("compra-10");
    expect(within(fila).getByText("Corregida")).toBeInTheDocument();
    expect(fila).toHaveTextContent("por la #11 · Se cargó mal · Admin");
    expect(within(fila).getByText("$ 100.000,00")).toHaveClass("line-through");
  });
});
