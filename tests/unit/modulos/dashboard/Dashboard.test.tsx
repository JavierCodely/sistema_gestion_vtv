import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Dashboard } from "@/modulos/dashboard/paginas/Dashboard";
import { authDePrueba, perfilDePrueba, renderConQuery, renderRuta } from "@tests/soporte/render";
import {
  argumentosDe,
  argumentosRpc,
  reiniciarSupabaseFalso,
  responder,
  responderRpc,
} from "@tests/soporte/supabase-falso";

vi.mock("@/compartido/lib/supabase", async () => ({
  supabase: (await import("@tests/soporte/supabase-falso")).supabaseFalso,
}));

const normal = (texto: string | null | undefined) => (texto ?? "").replace(/\s/g, " ");
const celdas = (fila: HTMLElement) =>
  within(fila)
    .getAllByRole("cell")
    .map((c) => normal(c.textContent));

const ventas = (
  agrupacion: string,
  nombre: string,
  cantidad: number,
  total: number,
  descontado = 0,
) => ({
  agrupacion,
  id: 1,
  nombre,
  cantidad,
  total,
  total_descontado: descontado,
});
const gasto = (agrupacion: string, nombre: string, cantidad: number, total: number) => ({
  agrupacion,
  id: null,
  nombre,
  cantidad,
  total,
});

beforeEach(() => {
  reiniciarSupabaseFalso();
  // Martes 24/11/2026 12:00 en Argentina: la semana va del lunes 23 al domingo 29.
  vi.useFakeTimers({ now: new Date("2026-11-24T15:00:00Z"), toFake: ["Date"] });
  responder("v_turnos", "select", {
    data: [{ id: 7, caja_nombre: "Caja 1", abierto_en: "2026-11-20T12:00:00Z" }],
  });
  // La BD trae solo los días que ya pasaron: lunes y martes.
  responderRpc("ventas_por_dia", {
    data: [
      { fecha: "2026-11-23", cantidad: 3, total: 60000 },
      { fecha: "2026-11-24", cantidad: 5, total: 95000 },
    ],
  });
  responderRpc("resumen_dashboard", {
    data: [
      ventas("total", "Total", 8, 155000, 4000),
      ventas("servicio", "VTV auto", 6, 120000, 4000),
      ventas("servicio", "VTV moto", 2, 35000),
      ventas("categoria", "Autos", 6, 120000, 4000),
      ventas("categoria", "Motos", 2, 35000),
      ventas("descuento", "Jubilados", 2, 36000, 4000),
    ],
  });
  responderRpc("resumen_gastos", {
    data: [
      gasto("total", "Total", 3, 19500),
      gasto("compra_certificados", "Compra de certificados", 1, 10000),
      gasto("otros_gastos", "Otros gastos", 2, 9500),
      gasto("rubro", "Insumos", 1, 10000),
      gasto("rubro", "Servicios", 1, 8000),
      gasto("rubro", "Comida y refrigerio", 1, 1500),
      gasto("subcategoria", "Insumos › Compra de certificados", 1, 10000),
      gasto("subcategoria", "Servicios › Luz", 1, 8000),
      gasto("subcategoria", "Comida y refrigerio › Comida", 1, 1500),
    ],
  });
});

const impuesto = (agrupacion: string, nombre: string, cantidad: number, total: number) => ({
  agrupacion,
  id: agrupacion === "total" ? null : 1,
  nombre,
  cantidad_ventas: cantidad,
  total,
  total_efectivo: total / 2,
  total_transferencia: total / 2,
});

beforeEach(() => {
  responderRpc("resumen_impuestos", {
    data: [
      impuesto("total", "Total", 6, 1800),
      impuesto("impuesto", "Ingresos brutos", 6, 1500),
      impuesto("impuesto", "Tasa transferencia", 2, 300),
    ],
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Dashboard (admin)", () => {
  it("es la portada del panel del admin", async () => {
    renderRuta("/admin", authDePrueba({ perfil: perfilDePrueba({ rol: "admin" }) }));
    expect(await screen.findByRole("heading", { name: "Dashboard", level: 1 })).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: "Ventas de esta semana" }),
    ).toBeInTheDocument();
  });

  it("ventas de esta semana: de lunes a domingo, solo hasta hoy y el día que más se vendió", async () => {
    renderConQuery(<Dashboard />);
    expect(normal((await screen.findByTestId("semana-rango")).textContent)).toBe(
      "Del lunes 23/11/2026 al domingo 29/11/2026",
    );
    await waitFor(() => {
      expect(argumentosRpc("ventas_por_dia")).toEqual({
        p_desde: "2026-11-23",
        p_hasta: "2026-11-29",
      });
    });
    expect(normal((await screen.findByTestId("semana-mejor-dia")).textContent)).toBe(
      "El día que más se vendió: Martes ($ 95.000,00, 5 ventas)",
    );
    expect(normal(screen.getByTestId("semana-Lunes").textContent)).toBe(
      "Lunes 23/11$ 60.000,003 ventas",
    );
    // Los días que todavía no llegaron, sin dato
    expect(normal(screen.getByTestId("semana-Miércoles").textContent)).toBe("Miércoles 25/11—");
    expect(normal(screen.getByTestId("semana-Domingo").textContent)).toBe("Domingo 29/11—");
  });

  it("un lunes sin ventas todavía lo dice", async () => {
    responderRpc("ventas_por_dia", { data: [{ fecha: "2026-11-23", cantidad: 0, total: 0 }] });
    renderConQuery(<Dashboard />);
    expect(await screen.findByText("Todavía no hay ventas esta semana.")).toBeInTheDocument();
  });

  it("por defecto el mes actual: muestra desde y hasta, ventas, servicios, categorías y descuentos", async () => {
    renderConQuery(<Dashboard />);
    expect(await screen.findByRole("heading", { name: "Noviembre de 2026" })).toBeInTheDocument();
    expect(normal(screen.getByTestId("dashboard-rango").textContent)).toBe(
      "Del 01/11/2026 al 30/11/2026",
    );
    await waitFor(() => {
      expect(argumentosRpc("resumen_dashboard")).toEqual({
        p_desde: "2026-11-01",
        p_hasta: "2026-11-30",
      });
    });
    expect(argumentosRpc("resumen_gastos")).toEqual({
      p_desde: "2026-11-01",
      p_hasta: "2026-11-30",
    });
    expect(normal((await screen.findByTestId("dato-ventas")).textContent)).toBe("8");
    expect(normal(screen.getByTestId("dato-vendido").textContent)).toBe("$ 155.000,00");
    expect(normal(screen.getByTestId("dato-descuentos").textContent)).toBe("2");
    expect(screen.getByText(/Descontado: \$\s4\.000,00/)).toBeInTheDocument();
    expect(celdas(screen.getByTestId("servicio-VTV auto"))).toEqual([
      "VTV auto",
      "6",
      "$ 120.000,00",
    ]);
    expect(celdas(screen.getByTestId("categoria-Motos"))).toEqual(["Motos", "2", "$ 35.000,00"]);
    expect(celdas(screen.getByTestId("descuento-Jubilados"))).toEqual([
      "Jubilados",
      "2",
      "$ 36.000,00",
      "$ 4.000,00",
    ]);
  });

  it("gastos: total, compra de certificados, otros gastos y en qué se gastó más", async () => {
    renderConQuery(<Dashboard />);
    expect(normal((await screen.findByTestId("dato-gastos")).textContent)).toBe("$ 19.500,00");
    expect(normal(screen.getByTestId("dato-compra-certificados").textContent)).toBe("$ 10.000,00");
    expect(normal(screen.getByTestId("dato-otros-gastos").textContent)).toBe("$ 9.500,00");
    expect(celdas(screen.getByTestId("rubro-Servicios"))).toEqual(["Servicios", "1", "$ 8.000,00"]);
    expect(celdas(screen.getByTestId("subcategoria-Servicios › Luz"))).toEqual([
      "Servicios › Luz",
      "1",
      "$ 8.000,00",
    ]);
  });

  it("solo año: trae el año entero; con un turno, solo ese turno", async () => {
    renderConQuery(<Dashboard />);
    await screen.findByRole("heading", { name: "Noviembre de 2026" });
    await userEvent.click(screen.getByLabelText("Mes"));
    await userEvent.click(await screen.findByRole("option", { name: "Todo el año" }));
    expect(await screen.findByRole("heading", { name: "Año 2026" })).toBeInTheDocument();
    expect(normal(screen.getByTestId("dashboard-rango").textContent)).toBe(
      "Del 01/01/2026 al 31/12/2026",
    );
    await waitFor(() => {
      expect(argumentosRpc("resumen_dashboard")).toEqual({
        p_desde: "2026-01-01",
        p_hasta: "2026-12-31",
      });
    });
    expect(argumentosDe("v_turnos", "select", "gte")).toEqual(["fecha_apertura", "2026-01-01"]);

    await waitFor(() => {
      expect(screen.getByLabelText("Turno")).toBeEnabled();
    });
    await userEvent.click(screen.getByLabelText("Turno"));
    await userEvent.click(await screen.findByRole("option", { name: /^Caja 1 · / }));
    await waitFor(() => {
      expect(argumentosRpc("resumen_dashboard")).toEqual({ p_turno_id: 7 });
    });
    expect(argumentosRpc("resumen_gastos")).toEqual({ p_turno_id: 7 });
    expect(normal(screen.getByTestId("dashboard-rango").textContent)).toMatch(
      /^Datos del turno: Caja 1 · 20\/11\/2026/,
    );
    expect(await screen.findByRole("heading", { name: /^Turno de Caja 1/ })).toBeInTheDocument();
  });

  it("impuestos: total por medio de pago y por impuesto, con el mismo filtro", async () => {
    renderConQuery(<Dashboard />);
    expect(normal((await screen.findByTestId("dato-impuestos-total")).textContent)).toBe(
      "$ 1.800,00",
    );
    await waitFor(() => {
      expect(argumentosRpc("resumen_impuestos")).toEqual({
        p_desde: "2026-11-01",
        p_hasta: "2026-11-30",
      });
    });
    expect(screen.getByText("6 ventas alcanzadas")).toBeInTheDocument();
    expect(normal(screen.getByTestId("dato-impuestos-efectivo").textContent)).toBe("$ 900,00");
    expect(normal(screen.getByTestId("dato-impuestos-transferencia").textContent)).toBe("$ 900,00");
    expect(screen.queryByTestId("dato-impuestos-tarjeta")).not.toBeInTheDocument();
    expect(celdas(screen.getByTestId("impuesto-Tasa transferencia"))).toEqual([
      "Tasa transferencia",
      "2",
      "$ 300,00",
    ]);

    await waitFor(() => {
      expect(screen.getByLabelText("Turno")).toBeEnabled();
    });
    await userEvent.click(screen.getByLabelText("Turno"));
    await userEvent.click(await screen.findByRole("option", { name: /^Caja 1 · / }));
    await waitFor(() => {
      expect(argumentosRpc("resumen_impuestos")).toEqual({ p_turno_id: 7 });
    });
  });

  it("período vacío: lo dice en cada bloque", async () => {
    responderRpc("resumen_dashboard", { data: [ventas("total", "Total", 0, 0)] });
    responderRpc("resumen_gastos", {
      data: [
        gasto("total", "Total", 0, 0),
        gasto("compra_certificados", "Compra de certificados", 0, 0),
        gasto("otros_gastos", "Otros gastos", 0, 0),
      ],
    });
    responderRpc("resumen_impuestos", { data: [impuesto("total", "Total", 0, 0)] });
    renderConQuery(<Dashboard />);
    expect(await screen.findAllByText("No hay ventas en ese período.")).toHaveLength(2);
    expect(screen.getByText("No se hicieron descuentos en ese período.")).toBeInTheDocument();
    expect(await screen.findAllByText("No hay gastos en ese período.")).toHaveLength(2);
    expect(
      await screen.findByText("No hay impuestos aplicados en ese período."),
    ).toBeInTheDocument();
  });

  it("muestra el error de la BD", async () => {
    responderRpc("resumen_gastos", {
      error: { code: "42501", message: "Solo un administrador puede hacer esta operación" },
    });
    renderConQuery(<Dashboard />);
    expect(
      await screen.findByText("Solo un administrador puede hacer esta operación"),
    ).toBeInTheDocument();
  });
});

describe("formato del eje", () => {
  it("pesos sin centavos", async () => {
    const { formatearEje } = await import("@/modulos/dashboard/lib/formato");
    expect(normal(formatearEje(800000))).toBe("$ 800.000");
  });
});
