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
