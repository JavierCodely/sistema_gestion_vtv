import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Descuentos } from "@/modulos/descuentos/paginas/Descuentos";
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

const JUBILADOS = {
  id: 1,
  nombre: "Jubilados",
  tipo: "porcentaje",
  valor: 10,
  activo: true,
  descuento_servicios: [{ servicio_id: 11 }],
};
const PROMO = {
  id: 2,
  nombre: "Promo vieja",
  tipo: "monto_fijo",
  valor: 2000,
  activo: false,
  descuento_servicios: [],
};

const servicio = (id: number, nombre: string, categoria_id: number, activo = true) => ({
  id,
  nombre,
  categoria_id,
  precio: 30000,
  requiere_certificado: true,
  activo,
});

beforeEach(() => {
  reiniciarSupabaseFalso();
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.error).mockClear();
  // El "hoy" de las estadísticas por defecto (el mes actual) se fija para que el test sea estable.
  vi.useFakeTimers({ now: new Date("2026-11-22T15:00:00Z"), toFake: ["Date"] });
  responder("descuentos", "select", { data: [JUBILADOS, PROMO] });
  responder("categorias_servicio", "select", {
    data: [
      { id: 1, nombre: "Autos", activa: true },
      { id: 2, nombre: "Motos", activa: true },
      { id: 3, nombre: "Camiones", activa: false },
      { id: 4, nombre: "Vacía", activa: true },
    ],
  });
  responder("servicios", "select", {
    data: [
      servicio(11, "VTV auto", 1),
      servicio(12, "Reverificación auto", 1),
      servicio(21, "VTV moto", 2),
      servicio(22, "Moto vieja", 2, false),
      servicio(31, "VTV camión", 3),
    ],
  });
  responderRpc("resumen_descuentos", { data: [] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Descuentos (admin)", () => {
  it("está en el menú del admin y en /admin/descuentos", async () => {
    responder("v_turnos", "select", { data: [] });
    renderRuta("/admin/descuentos", authDePrueba({ perfil: perfilDePrueba({ rol: "admin" }) }));
    expect(
      await screen.findByRole("heading", { name: "Descuentos", level: 1 }),
    ).toBeInTheDocument();
    const menu = screen.getByRole("navigation", { name: "Menú de administración" });
    expect(within(menu).getByRole("link", { name: "Descuentos" })).toHaveAttribute(
      "href",
      "/admin/descuentos",
    );
  });

  it("lista los descuentos con tipo, valor, cuántos servicios y si están activos", async () => {
    renderConQuery(<Descuentos />);
    const jubilados = await screen.findByTestId("descuento-Jubilados");
    expect(normal(jubilados.textContent)).toContain("Porcentaje10 %1");
    const promo = screen.getByTestId("descuento-Promo vieja");
    expect(normal(promo.textContent)).toContain("Monto fijo$ 2.000,000");
    expect(screen.getByRole("switch", { name: "Descuento Jubilados activo" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "Descuento Promo vieja activo" })).not.toBeChecked();
    expect(argumentosDe("descuentos", "select")).toEqual([
      "id, nombre, tipo, valor, activo, descuento_servicios(servicio_id)",
    ]);
  });

  it("sin descuentos muestra el estado vacío", async () => {
    responder("descuentos", "select", { data: [] });
    renderConQuery(<Descuentos />);
    expect(await screen.findByText("Todavía no hay descuentos.")).toBeInTheDocument();
  });

  it("crea un descuento validando como la BD", async () => {
    responder("descuentos", "insert", {
      data: { ...JUBILADOS, id: 3, nombre: "Estudiantes", descuento_servicios: [] },
    });
    renderConQuery(<Descuentos />);
    await userEvent.click(await screen.findByRole("button", { name: "Nuevo descuento" }));
    const dialogo = screen.getByRole("dialog", { name: "Nuevo descuento" });
    await userEvent.type(within(dialogo).getByLabelText("Nombre"), "Estudiantes");
    await userEvent.type(within(dialogo).getByLabelText("Porcentaje (%)"), "100");
    await userEvent.click(within(dialogo).getByRole("button", { name: "Crear descuento" }));
    expect(
      within(dialogo).getByText("El porcentaje tiene que ser menor a 100."),
    ).toBeInTheDocument();
    expect(argumentosDe("descuentos", "insert")).toBeUndefined();

    await userEvent.clear(within(dialogo).getByLabelText("Porcentaje (%)"));
    await userEvent.type(within(dialogo).getByLabelText("Porcentaje (%)"), "12,5");
    await userEvent.click(within(dialogo).getByRole("button", { name: "Crear descuento" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(argumentosDe("descuentos", "insert")).toEqual([
      { nombre: "Estudiantes", tipo: "porcentaje", valor: 12.5, activo: true },
    ]);
    expect(toast.success).toHaveBeenCalledWith("Descuento “Estudiantes” creado");
  });

  it("crea uno de monto fijo eligiendo el tipo", async () => {
    responder("descuentos", "insert", { data: { ...PROMO, id: 4, nombre: "Fijo" } });
    renderConQuery(<Descuentos />);
    await userEvent.click(await screen.findByRole("button", { name: "Nuevo descuento" }));
    const dialogo = screen.getByRole("dialog", { name: "Nuevo descuento" });
    await userEvent.type(within(dialogo).getByLabelText("Nombre"), "Fijo");
    await userEvent.click(within(dialogo).getByLabelText("Tipo"));
    await userEvent.click(await screen.findByRole("option", { name: "Monto fijo" }));
    await userEvent.type(within(dialogo).getByLabelText("Monto ($)"), "2.000,50");
    await userEvent.click(within(dialogo).getByRole("button", { name: "Crear descuento" }));
    await waitFor(() => {
      expect(argumentosDe("descuentos", "insert")).toEqual([
        { nombre: "Fijo", tipo: "monto_fijo", valor: 2000.5, activo: true },
      ]);
    });
  });

  it("muestra el nombre repetido (23505) con un mensaje claro", async () => {
    responder("descuentos", "insert", {
      error: { code: "23505", message: 'duplicate key value violates "descuentos_nombre_unico"' },
    });
    renderConQuery(<Descuentos />);
    await userEvent.click(await screen.findByRole("button", { name: "Nuevo descuento" }));
    const dialogo = screen.getByRole("dialog", { name: "Nuevo descuento" });
    await userEvent.type(within(dialogo).getByLabelText("Nombre"), "jubilados");
    await userEvent.type(within(dialogo).getByLabelText("Porcentaje (%)"), "5");
    await userEvent.click(within(dialogo).getByRole("button", { name: "Crear descuento" }));
    expect(await within(dialogo).findByRole("alert")).toHaveTextContent(
      "Ya existe un descuento con ese nombre.",
    );
  });

  it("edita un descuento con sus datos precargados", async () => {
    responder("descuentos", "update", { data: { ...JUBILADOS, valor: 15 } });
    renderConQuery(<Descuentos />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Editar descuento Jubilados" }),
    );
    const dialogo = screen.getByRole("dialog", { name: "Editar descuento" });
    expect(within(dialogo).getByLabelText("Nombre")).toHaveValue("Jubilados");
    const valor = within(dialogo).getByLabelText("Porcentaje (%)");
    expect(valor).toHaveValue("10");
    await userEvent.clear(valor);
    await userEvent.type(valor, "15");
    await userEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(argumentosDe("descuentos", "update")).toEqual([
      { nombre: "Jubilados", tipo: "porcentaje", valor: 15, activo: true },
    ]);
    expect(argumentosDe("descuentos", "update", "eq")).toEqual(["id", 1]);
  });

  it("se desactiva con el switch (no se borra)", async () => {
    responder("descuentos", "update", { data: { ...JUBILADOS, activo: false } });
    renderConQuery(<Descuentos />);
    await userEvent.click(
      await screen.findByRole("switch", { name: "Descuento Jubilados activo" }),
    );
    await waitFor(() => {
      expect(argumentosDe("descuentos", "update")).toEqual([{ activo: false }]);
    });
    expect(toast.success).toHaveBeenCalledWith("Descuento “Jubilados” desactivado");
    expect(screen.queryByRole("button", { name: /Borrar|Eliminar/ })).not.toBeInTheDocument();
  });

  it("si la BD rechaza el cambio de estado lo avisa traducido", async () => {
    responder("descuentos", "update", {
      error: { code: "42501", message: "permission denied for table descuentos" },
    });
    renderConQuery(<Descuentos />);
    await userEvent.click(
      await screen.findByRole("switch", { name: "Descuento Jubilados activo" }),
    );
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("No tenés permiso para hacer esto.");
    });
  });
});

describe("Descuentos: disponibilidad por servicio", () => {
  async function abrirServiciosDeJubilados() {
    renderConQuery(<Descuentos />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Servicios del descuento Jubilados" }),
    );
    return screen.getByRole("dialog", { name: "Servicios de “Jubilados”" });
  }

  it("muestra todas las categorías con todos sus servicios, los desactivados marcados", async () => {
    const dialogo = await abrirServiciosDeJubilados();
    const autos = within(dialogo).getByTestId("disponibilidad-Autos");
    expect(within(autos).getByRole("switch", { name: "VTV auto" })).toBeChecked();
    expect(within(autos).getByRole("switch", { name: "Reverificación auto" })).not.toBeChecked();
    // Autos queda parcial: 1 de 2
    const switchAutos = within(autos).getByRole("switch", { name: "Todos los servicios de Autos" });
    expect(switchAutos).not.toBeChecked();
    expect(switchAutos).toHaveAttribute("data-parcial", "true");
    expect(switchAutos).toHaveAccessibleDescription("Parcial: 1 de 2");

    const motos = within(dialogo).getByTestId("disponibilidad-Motos");
    expect(within(motos).getByText("Desactivado")).toBeInTheDocument();
    expect(within(motos).getByText("Ninguno")).toBeInTheDocument();
    const camiones = within(dialogo).getByTestId("disponibilidad-Camiones");
    expect(within(camiones).getByText("Desactivada")).toBeInTheDocument();
    const vacia = within(dialogo).getByTestId("disponibilidad-Vacía");
    expect(within(vacia).getByText("Sin servicios")).toBeInTheDocument();
    expect(
      within(vacia).getByRole("switch", { name: "Todos los servicios de Vacía" }),
    ).toBeDisabled();
  });

  it("el switch de categoría prende y apaga todos sus servicios; se guarda el conjunto final", async () => {
    responderRpc("fijar_servicios_descuento", { data: { id: 1 } });
    const dialogo = await abrirServiciosDeJubilados();
    const autos = within(dialogo).getByTestId("disponibilidad-Autos");
    const motos = within(dialogo).getByTestId("disponibilidad-Motos");

    // Parcial → prende todos
    await userEvent.click(
      within(autos).getByRole("switch", { name: "Todos los servicios de Autos" }),
    );
    expect(within(autos).getByRole("switch", { name: "Reverificación auto" })).toBeChecked();
    expect(
      within(autos).getByRole("switch", { name: "Todos los servicios de Autos" }),
    ).toBeChecked();
    expect(within(autos).getByText("Todos")).toBeInTheDocument();

    // Motos: prende todos (también el desactivado) y después apaga uno → parcial
    await userEvent.click(
      within(motos).getByRole("switch", { name: "Todos los servicios de Motos" }),
    );
    await userEvent.click(within(motos).getByRole("switch", { name: "Moto vieja" }));
    expect(within(motos).getByText("Parcial: 1 de 2")).toBeInTheDocument();

    // Autos: apaga todos
    await userEvent.click(
      within(autos).getByRole("switch", { name: "Todos los servicios de Autos" }),
    );
    expect(within(autos).getByRole("switch", { name: "VTV auto" })).not.toBeChecked();

    expect(within(dialogo).getByText("1 servicio habilitado")).toBeInTheDocument();
    await userEvent.click(within(dialogo).getByRole("button", { name: "Guardar servicios" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(argumentosRpc("fijar_servicios_descuento")).toEqual({
      p_descuento_id: 1,
      p_servicio_ids: [21],
    });
    expect(toast.success).toHaveBeenCalledWith("Servicios de “Jubilados” guardados");
  });

  it("muestra el rechazo de la BD sin cerrar", async () => {
    responderRpc("fijar_servicios_descuento", {
      error: { code: "22023", message: "Hay un servicio que no existe en la lista" },
    });
    const dialogo = await abrirServiciosDeJubilados();
    await userEvent.click(within(dialogo).getByRole("button", { name: "Guardar servicios" }));
    expect(await within(dialogo).findByRole("alert")).toHaveTextContent(
      "Hay un servicio que no existe en la lista",
    );
  });
});

describe("Descuentos: estadísticas", () => {
  it("por defecto pide el mes actual y muestra totales y rankings ordenados", async () => {
    responderRpc("resumen_descuentos", {
      data: [
        {
          agrupacion: "total",
          id: null,
          nombre: "Total",
          cantidad_ventas: 5,
          total_descontado: 13000,
        },
        {
          agrupacion: "descuento",
          id: 1,
          nombre: "Jubilados",
          cantidad_ventas: 4,
          total_descontado: 12000,
        },
        {
          agrupacion: "descuento",
          id: 2,
          nombre: "Promo vieja",
          cantidad_ventas: 1,
          total_descontado: 1000,
        },
        {
          agrupacion: "servicio",
          id: 11,
          nombre: "VTV auto",
          cantidad_ventas: 3,
          total_descontado: 9000,
        },
        {
          agrupacion: "servicio",
          id: 21,
          nombre: "VTV moto",
          cantidad_ventas: 2,
          total_descontado: 4000,
        },
      ],
    });
    renderConQuery(<Descuentos />);
    expect(await screen.findByTestId("estadisticas-cantidad")).toHaveTextContent("5");
    expect(normal(screen.getByTestId("estadisticas-total").textContent)).toBe("$ 13.000,00");
    expect(argumentosRpc("resumen_descuentos")).toEqual({
      p_desde: "2026-11-01",
      p_hasta: "2026-11-22",
    });
    expect(screen.getByLabelText("Desde")).toHaveValue("2026-11-01");
    expect(screen.getByLabelText("Hasta")).toHaveValue("2026-11-22");

    const porDescuento = screen.getByRole("region", { name: "Por descuento" });
    expect(
      within(porDescuento)
        .getAllByRole("row")
        .slice(1)
        .map((f) => normal(f.textContent)),
    ).toEqual(["1Jubilados4$ 12.000,00", "2Promo vieja1$ 1.000,00"]);
    const porServicio = screen.getByRole("region", { name: "Por servicio" });
    expect(
      within(porServicio)
        .getAllByRole("row")
        .slice(1)
        .map((f) => normal(f.textContent)),
    ).toEqual(["1VTV auto3$ 9.000,00", "2VTV moto2$ 4.000,00"]);
  });

  it("cambia el rango y avisa si está invertido (sin consultar)", async () => {
    renderConQuery(<Descuentos />);
    expect(
      await screen.findByText("No hubo ventas con descuento en este período."),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-10-01" } });
    await waitFor(() => {
      expect(argumentosRpc("resumen_descuentos")).toEqual({
        p_desde: "2026-10-01",
        p_hasta: "2026-11-22",
      });
    });
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-12-01" } });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "La fecha “desde” no puede ser posterior a “hasta”.",
    );
    expect(argumentosRpc("resumen_descuentos")).toEqual({
      p_desde: "2026-10-01",
      p_hasta: "2026-11-22",
    });
  });

  it("muestra el error de la BD", async () => {
    responderRpc("resumen_descuentos", {
      error: { code: "42501", message: "Solo el administrador puede hacer esto" },
    });
    renderConQuery(<Descuentos />);
    expect(await screen.findByText("Solo el administrador puede hacer esto")).toBeInTheDocument();
  });
});
