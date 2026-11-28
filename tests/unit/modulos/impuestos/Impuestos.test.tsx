import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Impuestos } from "@/modulos/impuestos/paginas/Impuestos";
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
vi.mock("sonner", () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }));

const normal = (texto: string | null | undefined) => (texto ?? "").replace(/\s/g, " ");

const IIBB = {
  id: 1,
  nombre: "Ingresos brutos",
  tipo: "porcentaje",
  valor: 3,
  medios: ["efectivo", "transferencia"],
  todos_servicios: true,
  activo: true,
  impuesto_servicios: [],
};
const TASA = {
  id: 2,
  nombre: "Tasa transferencia",
  tipo: "monto_fijo",
  valor: 150,
  medios: ["transferencia"],
  todos_servicios: false,
  activo: false,
  impuesto_servicios: [{ servicio_id: 11 }, { servicio_id: 12 }],
};

const servicio = (id: number, nombre: string, categoria_id: number) => ({
  id,
  nombre,
  categoria_id,
  precio: 30000,
  requiere_certificado: true,
  activo: true,
});

const TOTAL = {
  agrupacion: "total",
  id: null,
  nombre: "Total",
  cantidad_ventas: 4,
  total: 1912.5,
  total_efectivo: 750,
  total_transferencia: 1162.5,
};

beforeEach(() => {
  reiniciarSupabaseFalso();
  vi.mocked(toast.success).mockClear();
  // "Hoy" fijo: el período por defecto es noviembre de 2026.
  vi.useFakeTimers({ now: new Date("2026-11-22T15:00:00Z"), toFake: ["Date"] });
  responder("impuestos", "select", { data: [IIBB, TASA] });
  responder("categorias_servicio", "select", {
    data: [
      { id: 1, nombre: "Autos", activa: true },
      { id: 2, nombre: "Motos", activa: true },
    ],
  });
  responder("servicios", "select", {
    data: [
      servicio(11, "VTV auto", 1),
      servicio(12, "Reverificación auto", 1),
      servicio(21, "VTV moto", 2),
    ],
  });
  responder("v_turnos", "select", {
    data: [{ id: 7, caja_nombre: "Caja 1", abierto_en: "2026-11-20T12:00:00Z" }],
  });
  responderRpc("resumen_impuestos", {
    data: [
      TOTAL,
      {
        agrupacion: "impuesto",
        id: 1,
        nombre: "Ingresos brutos",
        cantidad_ventas: 4,
        total: 1650,
        total_efectivo: 750,
        total_transferencia: 900,
      },
      {
        agrupacion: "impuesto",
        id: 2,
        nombre: "Tasa transferencia",
        cantidad_ventas: 2,
        total: 262.5,
        total_efectivo: 0,
        total_transferencia: 262.5,
      },
    ],
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Impuestos (admin): catálogo", () => {
  it("está en el menú del admin y en /admin/impuestos", async () => {
    renderRuta("/admin/impuestos", authDePrueba({ perfil: perfilDePrueba({ rol: "admin" }) }));
    expect(await screen.findByRole("heading", { name: "Impuestos", level: 1 })).toBeInTheDocument();
    const menu = screen.getByRole("navigation", { name: "Menú de administración" });
    expect(within(menu).getByRole("link", { name: "Impuestos" })).toHaveAttribute(
      "href",
      "/admin/impuestos",
    );
  });

  it("lista los impuestos con tipo, valor, medios, servicios y si están activos", async () => {
    renderConQuery(<Impuestos />);
    const iibb = await screen.findByTestId("impuesto-Ingresos brutos");
    expect(normal(iibb.textContent)).toContain("Porcentaje3 %TodosTodos");
    const tasa = screen.getByTestId("impuesto-Tasa transferencia");
    expect(normal(tasa.textContent)).toContain(
      "Monto fijo por venta$ 150,00 por ventaTransferencia2 servicios",
    );
    expect(screen.getByRole("switch", { name: "Impuesto Ingresos brutos activo" })).toBeChecked();
    expect(
      screen.getByRole("switch", { name: "Impuesto Tasa transferencia activo" }),
    ).not.toBeChecked();
  });

  it("crea un impuesto eligiendo los medios de pago, validando como la BD", async () => {
    responder("impuestos", "insert", { data: { ...TASA, id: 3, nombre: "Percepción" } });
    renderConQuery(<Impuestos />);
    await userEvent.click(await screen.findByRole("button", { name: "Nuevo impuesto" }));
    const dialogo = screen.getByRole("dialog", { name: "Nuevo impuesto" });
    await userEvent.type(within(dialogo).getByLabelText("Nombre"), "Percepción");
    await userEvent.type(within(dialogo).getByLabelText("Porcentaje (%)"), "2,5");
    // Por defecto: todos los medios. Sin ninguno no se puede guardar.
    expect(within(dialogo).getByRole("switch", { name: "Todos los medios de pago" })).toBeChecked();
    await userEvent.click(
      within(dialogo).getByRole("switch", { name: "Todos los medios de pago" }),
    );
    await userEvent.click(within(dialogo).getByRole("button", { name: "Crear impuesto" }));
    expect(within(dialogo).getByText("Elegí al menos un medio de pago.")).toBeInTheDocument();
    expect(argumentosDe("impuestos", "insert")).toBeUndefined();

    expect(within(dialogo).queryByRole("switch", { name: "Tarjeta" })).not.toBeInTheDocument();
    await userEvent.click(within(dialogo).getByRole("switch", { name: "Efectivo" }));
    await userEvent.click(within(dialogo).getByRole("button", { name: "Crear impuesto" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(argumentosDe("impuestos", "insert")).toEqual([
      {
        nombre: "Percepción",
        tipo: "porcentaje",
        valor: 2.5,
        medios: ["efectivo"],
        activo: true,
      },
    ]);
    expect(toast.success).toHaveBeenCalledWith("Impuesto “Percepción” creado");
  });

  it("crea uno de monto fijo por venta", async () => {
    responder("impuestos", "insert", { data: { ...TASA, id: 4, nombre: "Fijo" } });
    renderConQuery(<Impuestos />);
    await userEvent.click(await screen.findByRole("button", { name: "Nuevo impuesto" }));
    const dialogo = screen.getByRole("dialog", { name: "Nuevo impuesto" });
    await userEvent.type(within(dialogo).getByLabelText("Nombre"), "Fijo");
    await userEvent.click(within(dialogo).getByLabelText("Tipo"));
    await userEvent.click(await screen.findByRole("option", { name: "Monto fijo por venta" }));
    await userEvent.type(within(dialogo).getByLabelText("Monto por venta ($)"), "1.500,50");
    await userEvent.click(within(dialogo).getByRole("button", { name: "Crear impuesto" }));
    await waitFor(() => {
      expect(argumentosDe("impuestos", "insert")).toEqual([
        {
          nombre: "Fijo",
          tipo: "monto_fijo",
          valor: 1500.5,
          medios: ["efectivo", "transferencia"],
          activo: true,
        },
      ]);
    });
  });

  it("muestra el nombre repetido (23505) con un mensaje claro", async () => {
    responder("impuestos", "insert", {
      error: { code: "23505", message: 'duplicate key value violates "impuestos_nombre_unico"' },
    });
    renderConQuery(<Impuestos />);
    await userEvent.click(await screen.findByRole("button", { name: "Nuevo impuesto" }));
    const dialogo = screen.getByRole("dialog", { name: "Nuevo impuesto" });
    await userEvent.type(within(dialogo).getByLabelText("Nombre"), "ingresos brutos");
    await userEvent.type(within(dialogo).getByLabelText("Porcentaje (%)"), "5");
    await userEvent.click(within(dialogo).getByRole("button", { name: "Crear impuesto" }));
    expect(await within(dialogo).findByRole("alert")).toHaveTextContent(
      "Ya existe un impuesto con ese nombre.",
    );
  });

  it("edita un impuesto con sus datos precargados", async () => {
    responder("impuestos", "update", { data: { ...TASA, valor: 200 } });
    renderConQuery(<Impuestos />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Editar impuesto Tasa transferencia" }),
    );
    const dialogo = screen.getByRole("dialog", { name: "Editar impuesto" });
    expect(within(dialogo).getByLabelText("Nombre")).toHaveValue("Tasa transferencia");
    expect(within(dialogo).getByRole("switch", { name: "Transferencia" })).toBeChecked();
    expect(within(dialogo).getByRole("switch", { name: "Efectivo" })).not.toBeChecked();
    const valor = within(dialogo).getByLabelText("Monto por venta ($)");
    await userEvent.clear(valor);
    await userEvent.type(valor, "200");
    await userEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    await waitFor(() => {
      expect(argumentosDe("impuestos", "update")).toEqual([
        {
          nombre: "Tasa transferencia",
          tipo: "monto_fijo",
          valor: 200,
          medios: ["transferencia"],
          activo: false,
        },
      ]);
    });
    expect(argumentosDe("impuestos", "update", "eq")).toEqual(["id", 2]);
  });

  it("servicios: 'Todos los servicios' o los elegidos por categoría", async () => {
    responderRpc("fijar_servicios_impuesto", { data: TASA });
    renderConQuery(<Impuestos />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Servicios del impuesto Tasa transferencia" }),
    );
    let dialogo = screen.getByRole("dialog", { name: "Servicios de “Tasa transferencia”" });
    expect(within(dialogo).getByRole("switch", { name: "Todos los servicios" })).not.toBeChecked();
    expect(within(dialogo).getByRole("switch", { name: "VTV auto" })).toBeChecked();
    await userEvent.click(
      within(dialogo).getByRole("switch", { name: "Todos los servicios de Motos" }),
    );
    await userEvent.click(within(dialogo).getByRole("switch", { name: "Reverificación auto" }));
    await userEvent.click(within(dialogo).getByRole("button", { name: "Guardar servicios" }));
    await waitFor(() => {
      expect(argumentosRpc("fijar_servicios_impuesto")).toEqual({
        p_impuesto_id: 2,
        p_todos: false,
        p_servicio_ids: [11, 21],
      });
    });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Servicios del impuesto Tasa transferencia" }),
    );
    dialogo = screen.getByRole("dialog", { name: "Servicios de “Tasa transferencia”" });
    await userEvent.click(within(dialogo).getByRole("switch", { name: "Todos los servicios" }));
    // Con "todos" no hace falta elegir: la lista se oculta.
    expect(within(dialogo).queryByRole("switch", { name: "VTV auto" })).not.toBeInTheDocument();
    await userEvent.click(within(dialogo).getByRole("button", { name: "Guardar servicios" }));
    await waitFor(() => {
      expect(argumentosRpc("fijar_servicios_impuesto")).toEqual({
        p_impuesto_id: 2,
        p_todos: true,
        p_servicio_ids: [],
      });
    });
  });
});

describe("Impuestos (admin): reporte", () => {
  it("por defecto muestra el mes actual con el total y los montos por medio de pago", async () => {
    renderConQuery(<Impuestos />);
    expect(await screen.findByRole("heading", { name: "Noviembre de 2026" })).toBeInTheDocument();
    await waitFor(() => {
      expect(argumentosRpc("resumen_impuestos")).toEqual({
        p_desde: "2026-11-01",
        p_hasta: "2026-11-30",
      });
    });
    expect(normal((await screen.findByTestId("impuestos-Total")).textContent)).toBe("$ 1.912,50");
    expect(normal(screen.getByTestId("impuestos-Efectivo").textContent)).toBe("$ 750,00");
    expect(normal(screen.getByTestId("impuestos-Transferencia").textContent)).toBe("$ 1.162,50");
    expect(screen.queryByTestId("impuestos-Tarjeta")).not.toBeInTheDocument();
    expect(normal(screen.getByTestId("impuestos-Ventas alcanzadas").textContent)).toBe("4");
    const tasa = screen.getByTestId("reporte-impuesto-Tasa transferencia");
    expect(
      within(tasa)
        .getAllByRole("cell")
        .map((c) => normal(c.textContent)),
    ).toEqual(["Tasa transferencia", "2", "$ 0,00", "$ 262,50", "$ 262,50"]);
  });

  it("con un año y 'Todo el año' trae el año entero; con un mes, ese mes", async () => {
    renderConQuery(<Impuestos />);
    await screen.findByRole("heading", { name: "Noviembre de 2026" });
    await userEvent.click(screen.getByLabelText("Año"));
    await userEvent.click(await screen.findByRole("option", { name: "2027" }));
    await userEvent.click(screen.getByLabelText("Mes"));
    await userEvent.click(await screen.findByRole("option", { name: "Todo el año" }));
    expect(await screen.findByRole("heading", { name: "Año 2027" })).toBeInTheDocument();
    await waitFor(() => {
      expect(argumentosRpc("resumen_impuestos")).toEqual({
        p_desde: "2027-01-01",
        p_hasta: "2027-12-31",
      });
    });

    await userEvent.click(screen.getByLabelText("Año"));
    await userEvent.click(await screen.findByRole("option", { name: "2024" }));
    await userEvent.click(screen.getByLabelText("Mes"));
    await userEvent.click(await screen.findByRole("option", { name: "Febrero" }));
    await waitFor(() => {
      expect(argumentosRpc("resumen_impuestos")).toEqual({
        p_desde: "2024-02-01",
        p_hasta: "2024-02-29",
      });
    });
  });

  it("filtra por un turno del período", async () => {
    renderConQuery(<Impuestos />);
    await screen.findByRole("heading", { name: "Noviembre de 2026" });
    await waitFor(() => {
      expect(screen.getByLabelText("Turno")).toBeEnabled();
    });
    expect(argumentosDe("v_turnos", "select", "gte")).toEqual(["fecha_apertura", "2026-11-01"]);
    await userEvent.click(screen.getByLabelText("Turno"));
    await userEvent.click(await screen.findByRole("option", { name: /^Caja 1 · / }));
    await waitFor(() => {
      expect(argumentosRpc("resumen_impuestos")).toEqual({ p_turno_id: 7 });
    });
    expect(await screen.findByRole("heading", { name: /^Turno de Caja 1/ })).toBeInTheDocument();
  });

  it("sin impuestos aplicados en el período lo dice", async () => {
    responderRpc("resumen_impuestos", {
      data: [
        {
          ...TOTAL,
          cantidad_ventas: 0,
          total: 0,
          total_efectivo: 0,
          total_transferencia: 0,
        },
      ],
    });
    renderConQuery(<Impuestos />);
    expect(
      await screen.findByText("No hay impuestos aplicados en ese período."),
    ).toBeInTheDocument();
  });
});
