import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TablaVentas } from "@/modulos/caja/componentes/TablaVentas";
import { renderConQuery } from "@tests/soporte/render";
import { reiniciarSupabaseFalso, responderRpc } from "@tests/soporte/supabase-falso";
import { ventaDePrueba } from "../ventas/datos";

vi.mock("@/compartido/lib/supabase", async () => ({
  supabase: (await import("@tests/soporte/supabase-falso")).supabaseFalso,
}));

beforeEach(() => {
  reiniciarSupabaseFalso();
  responderRpc("nombre_usuario", { data: "Ana Pérez" });
});

describe("TablaVentas", () => {
  it("en el celular cada venta es una tarjeta: cada celda lleva la etiqueta de su columna", () => {
    renderConQuery(
      <TablaVentas
        ventas={[ventaDePrueba({ id: 1 })]}
        acciones={() => <button type="button">Anular</button>}
      />,
    );
    expect(screen.getByRole("table")).toHaveClass("max-md:[&>thead]:hidden");
    const celdas = Array.from(screen.getByTestId("venta-1").querySelectorAll("td"));
    expect(
      celdas.map((c) => c.dataset.label ?? (c.hasAttribute("data-acciones") ? "·" : "")),
    ).toEqual([
      "Venta N°",
      "Hora",
      "Vendió",
      "Servicio",
      "Patente",
      "Certificado",
      "Medio",
      "Descuento",
      "Precio",
      "Estado",
      "·",
    ]);
    // Sin certificado, descuento ni estado: esas líneas no se muestran en el celular.
    for (const etiqueta of ["Certificado", "Descuento", "Estado"]) {
      expect(celdas.find((c) => c.dataset.label === etiqueta)).toHaveClass("max-md:hidden!");
    }
    expect(celdas.find((c) => c.dataset.label === "Patente")).not.toHaveClass("max-md:hidden!");
  });

  it("marca las condicionales (hasta cuándo) y las vueltas sin cargo", () => {
    renderConQuery(
      <TablaVentas
        ventas={[
          ventaDePrueba({ id: 1, condicional_vence: "2026-12-02" }),
          ventaDePrueba({ id: 2, precio: 0, vuelta_de: 1 }),
          ventaDePrueba({ id: 3 }),
        ]}
      />,
    );
    expect(screen.getByTestId("venta-1")).toHaveTextContent("Condicional hasta 02/12/2026");
    expect(screen.getByTestId("venta-2")).toHaveTextContent("Vuelta de condicional");
    expect(screen.getByTestId("venta-3")).not.toHaveTextContent("ondicional");
  });

  it("una condicional al 50% muestra lo que paga al volver", () => {
    renderConQuery(
      <TablaVentas
        ventas={[
          ventaDePrueba({
            id: 1,
            precio: 35500,
            condicional_vence: "2026-12-02",
            condicional_saldo: 35500,
          }),
          ventaDePrueba({ id: 2, condicional_vence: "2026-12-02", condicional_saldo: 0 }),
        ]}
      />,
    );
    expect(screen.getByTestId("venta-1").textContent.replace(/\s/g, " ")).toContain(
      "Al 50%: al volver paga $ 35.500,00",
    );
    expect(screen.getByTestId("venta-2")).not.toHaveTextContent("Al 50%");
  });
});
