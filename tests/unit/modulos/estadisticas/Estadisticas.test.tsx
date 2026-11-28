import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Estadisticas } from "@/modulos/estadisticas/paginas/Estadisticas";
import { authDePrueba, perfilDePrueba, renderConQuery, renderRuta } from "@tests/soporte/render";
import { argumentosRpc, reiniciarSupabaseFalso, responderRpc } from "@tests/soporte/supabase-falso";

vi.mock("@/compartido/lib/supabase", async () => ({
  supabase: (await import("@tests/soporte/supabase-falso")).supabaseFalso,
}));

const normal = (texto: string | null | undefined) => (texto ?? "").replace(/\s/g, " ");
const celdas = (fila: HTMLElement) =>
  within(fila)
    .getAllByRole("cell")
    .map((c) => normal(c.textContent));

const vehiculos = {
  ventas_cantidad: 13,
  ventas_total: 180000,
  ticket_promedio: 13846.15,
  ventas_sin_patente: 1,
  vehiculos: 8,
  vehiculos_nuevos: 7,
  vehiculos_que_vuelven: 1,
  vehiculos_repetidos: 2,
  anuladas_cantidad: 1,
  anuladas_total: 20000,
};
const condicionales = {
  condicionales: 5,
  al_50: 1,
  volvieron_en_plazo: 1,
  volvieron_fuera_plazo: 1,
  cobradas_de_nuevo: 1,
  vigentes_sin_volver: 1,
  vencidas_sin_volver: 1,
};
const mes = (n: number, ventas = 0, anterior = 0) => ({
  mes: n,
  ventas,
  total: ventas * 20000,
  vehiculos: ventas,
  ventas_anterior: anterior,
  total_anterior: anterior * 20000,
  vehiculos_anterior: anterior,
});

beforeEach(() => {
  reiniciarSupabaseFalso();
  vi.useFakeTimers({ now: new Date("2026-11-24T15:00:00Z"), toFake: ["Date"] });
  responderRpc("estadisticas_vehiculos", { data: [vehiculos] });
  responderRpc("estadisticas_categorias", {
    data: [
      { categoria_id: 1, nombre: "Autos", ventas: 10, vehiculos: 6, total: 150000 },
      { categoria_id: 2, nombre: "Motos", ventas: 3, vehiculos: 2, total: 30000 },
    ],
  });
  responderRpc("estadisticas_condicionales", { data: [condicionales] });
  responderRpc("estadisticas_horarios", {
    data: [
      ...[2, 1, 2, 1, 3, 2, 0].map((cantidad, i) => ({
        agrupacion: "dia",
        valor: i + 1,
        cantidad,
        total: cantidad * 10000,
      })),
      { agrupacion: "hora", valor: 9, cantidad: 1, total: 20000 },
      { agrupacion: "hora", valor: 10, cantidad: 0, total: 0 },
      { agrupacion: "hora", valor: 11, cantidad: 9, total: 120000 },
    ],
  });
  responderRpc("comparacion_anual", {
    data: Array.from({ length: 12 }, (_, i) => (i === 2 ? mes(3, 13, 1) : mes(i + 1))),
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Estadísticas", () => {
  it("está en el menú del admin", async () => {
    renderRuta("/admin/estadisticas", authDePrueba({ perfil: perfilDePrueba({ rol: "admin" }) }));
    expect(
      await screen.findByRole("heading", { name: "Estadísticas", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Estadísticas" }).length).toBeGreaterThan(0);
  });

  it("por defecto el año actual: vehículos, tipo, condicionales, horarios y año contra año", async () => {
    renderConQuery(<Estadisticas />);
    expect(await screen.findByRole("heading", { name: "Año 2026" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Turno")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(argumentosRpc("estadisticas_vehiculos")).toEqual({
        p_desde: "2026-01-01",
        p_hasta: "2026-12-31",
      });
    });
    expect(argumentosRpc("comparacion_anual")).toEqual({ p_anio: 2026 });

    expect((await screen.findByTestId("dato-vehiculos")).textContent).toBe("8");
    expect(normal(screen.getByText(/13 ventas · /).textContent)).toBe(
      "13 ventas · $ 180.000,00 · 1 venta sin patente",
    );
    expect(screen.getByTestId("dato-vehiculos-nuevos").textContent).toBe("7");
    expect(screen.getByTestId("dato-vehiculos-vuelven").textContent).toBe("1");
    expect(screen.getByTestId("dato-vehiculos-repetidos").textContent).toBe("2");
    expect(normal(screen.getByTestId("dato-ticket").textContent)).toBe("$ 13.846,15");
    expect(screen.getByTestId("dato-anuladas").textContent).toBe("1");

    expect(celdas(await screen.findByTestId("tipo-Autos"))).toEqual(["Autos", "6", "$ 150.000,00"]);
    expect(screen.getByRole("columnheader", { name: "Vehículos" })).toBeInTheDocument();

    expect((await screen.findByTestId("dato-condicionales")).textContent).toBe("5");
    expect(screen.getByText("1 pagadas al 50%")).toBeInTheDocument();
    expect(screen.getByTestId("dato-vencidas").textContent).toBe("1");

    expect(celdas(await screen.findByTestId("dia-Viernes"))).toEqual([
      "Viernes",
      "3",
      "$ 30.000,00",
    ]);
    expect(celdas(screen.getByTestId("dia-Domingo"))).toEqual(["Domingo", "0", "$ 0,00"]);
    expect(celdas(screen.getByTestId("hora-De 11 a 12 h"))).toEqual([
      "De 11 a 12 h",
      "9",
      "$ 120.000,00",
    ]);

    expect(await screen.findByRole("heading", { name: "2026 contra 2025" })).toBeInTheDocument();
    expect(celdas(screen.getByTestId("comparacion-Marzo"))).toEqual([
      "Marzo",
      "13",
      "1",
      "$ 260.000,00",
      "$ 20.000,00",
      "13",
      "1",
    ]);
  });

  it("con un mes consulta ese mes; la comparación sigue siendo del año", async () => {
    renderConQuery(<Estadisticas />);
    await screen.findByRole("heading", { name: "Año 2026" });
    await userEvent.click(screen.getByLabelText("Mes"));
    await userEvent.click(await screen.findByRole("option", { name: "Marzo" }));
    expect(await screen.findByRole("heading", { name: "Marzo de 2026" })).toBeInTheDocument();
    await waitFor(() => {
      expect(argumentosRpc("estadisticas_horarios")).toEqual({
        p_desde: "2026-03-01",
        p_hasta: "2026-03-31",
      });
    });
    expect(argumentosRpc("estadisticas_condicionales")).toEqual({
      p_desde: "2026-03-01",
      p_hasta: "2026-03-31",
    });
    expect(argumentosRpc("comparacion_anual")).toEqual({ p_anio: 2026 });
  });

  it("período vacío: lo dice en cada bloque", async () => {
    responderRpc("estadisticas_vehiculos", {
      data: [Object.fromEntries(Object.keys(vehiculos).map((k) => [k, 0])) as typeof vehiculos],
    });
    responderRpc("estadisticas_categorias", { data: [] });
    responderRpc("estadisticas_condicionales", {
      data: [Object.fromEntries(Object.keys(condicionales).map((k) => [k, 0]))],
    });
    responderRpc("estadisticas_horarios", {
      data: [1, 2, 3, 4, 5, 6, 7].map((valor) => ({
        agrupacion: "dia",
        valor,
        cantidad: 0,
        total: 0,
      })),
    });
    responderRpc("comparacion_anual", {
      data: Array.from({ length: 12 }, (_, i) => mes(i + 1)),
    });
    renderConQuery(<Estadisticas />);
    await waitFor(() => {
      expect(screen.getAllByText("No hay ventas en ese período.")).toHaveLength(3);
    });
    expect(
      await screen.findByText("No se vendieron condicionales en ese período."),
    ).toBeInTheDocument();
    expect(await screen.findByText("No hay ventas en esos dos años.")).toBeInTheDocument();
  });

  it("muestra el error de la BD", async () => {
    responderRpc("estadisticas_horarios", {
      error: { code: "42501", message: "Solo un administrador puede hacer esta operación" },
    });
    renderConQuery(<Estadisticas />);
    expect(
      await screen.findByText("Solo un administrador puede hacer esta operación"),
    ).toBeInTheDocument();
  });
});
