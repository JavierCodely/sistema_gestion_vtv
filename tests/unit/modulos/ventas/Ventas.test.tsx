import { screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TAMANO_PAGINA } from "@/compartido/lib/paginacion";
import { mesActual } from "@/compartido/lib/rango-fechas";
import { authDePrueba, perfilDePrueba, renderRuta } from "@tests/soporte/render";
import {
  argumentosRpc,
  cambiarEstadoCanales,
  canales,
  conFiltro,
  emitirCambio,
  llamadas,
  reiniciarSupabaseFalso,
  responder,
  responderRpc,
} from "@tests/soporte/supabase-falso";
import { CAJERO_ID, turnoDePrueba, ventaDePrueba } from "./datos";

vi.mock("@/compartido/lib/supabase", async () => ({
  supabase: (await import("@tests/soporte/supabase-falso")).supabaseFalso,
}));

const admin = () => authDePrueba({ perfil: perfilDePrueba({ rol: "admin" }) });
/** formatearMoneda separa "$" con un espacio duro. */
const normal = (texto: string | null) => (texto ?? "").replace(/\s/g, " ");

const RESUMEN = {
  cantidad_turnos: 3,
  turnos_abiertos: 1,
  ventas_cantidad: 7,
  ventas_efectivo: 60000,
  ventas_transferencia: 25000,
  ventas_tarjeta: 15000,
  ventas_total: 100000,
  gastos_total: 8000,
  neto: 92000,
};

/** Turnos abiertos (sección en vivo y barra): `v_turnos` con `.eq("abierto", true)`. */
function responderAbiertos(respuesta: { data?: unknown; error?: unknown }) {
  responder("v_turnos", "select", respuesta, { cuando: conFiltro("eq", "abierto", true) });
}

/** Argumentos de `metodo` en la última consulta del historial (la única con `gte`). */
function argumentosHistorial(metodo: string) {
  const llamada = llamadas.findLast(
    (l) => l.tabla === "v_turnos" && l.cadena.some((c) => c.metodo === "gte"),
  );
  return llamada?.cadena.find((c) => c.metodo === metodo)?.argumentos;
}

beforeEach(() => {
  reiniciarSupabaseFalso();
  responderAbiertos({ data: [] });
  responderRpc("resumen_turnos", { data: [RESUMEN] });
  responder("v_comprobantes", "select", { data: [] });
  responder("ventas", "select", { data: [] });
  responderRpc("nombre_usuario", { data: "Carlos Demo" });
});

function prepararApertura() {
  responder("v_turnos", "select", { data: [] });
  responderRpc("cajas_para_turno", {
    data: [
      { id: 1, nombre: "Caja 1", ocupada: true, turno_id: 3, abierto_en: "2026-11-20T11:00:00Z" },
      { id: 2, nombre: "Caja 2", ocupada: false, turno_id: null, abierto_en: null },
    ],
  });
  responderRpc("abrir_turno", { data: { id: 9, caja_id: 2 } });
}

describe("Ventas (admin)", () => {
  it("abrir turno (desde la barra) abre una caja libre con el efectivo inicial, sin elegir quién atiende", async () => {
    prepararApertura();
    renderRuta("/admin/ventas", admin());
    await userEvent.click(
      within(await screen.findByRole("banner")).getByRole("button", { name: "Abrir turno" }),
    );
    const dialogo = await screen.findByRole("dialog", { name: "Abrir turno" });
    expect(await within(dialogo).findByLabelText("Caja")).toHaveTextContent("Caja 2");
    expect(within(dialogo).queryByLabelText("Atiende")).not.toBeInTheDocument();
    await userEvent.click(within(dialogo).getByRole("button", { name: "Abrir turno" }));
    expect(within(dialogo).getByText("Ingresá el efectivo inicial.")).toBeInTheDocument();
    expect(argumentosRpc("abrir_turno")).toBeUndefined();

    await userEvent.type(within(dialogo).getByLabelText("Efectivo inicial ($)"), "30.000");
    await userEvent.click(within(dialogo).getByRole("button", { name: "Abrir turno" }));
    await waitFor(() => {
      expect(argumentosRpc("abrir_turno")).toEqual({ p_caja_id: 2, p_efectivo_inicial: 30000 });
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("el historial lista los turnos con totales por medio, gastos y neto", async () => {
    responder("v_turnos", "select", {
      data: [turnoDePrueba(), turnoDePrueba({ id: 4, abierto: false, caja_nombre: "Caja 2" })],
    });
    renderRuta("/admin/ventas", admin());
    const fila = await screen.findByTestId("turno-5");
    const celdas = within(fila)
      .getAllByRole("cell")
      .map((c) => normal(c.textContent));
    // El turno es de la caja: quiénes atendieron y qué admin lo abrió (no hay "cajero del turno").
    expect(screen.getByRole("columnheader", { name: "Atendieron" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Abrió" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Cajero" })).not.toBeInTheDocument();
    expect(celdas).toEqual(
      expect.arrayContaining([
        "Caja 1",
        "Ana Administradora y Carlos Demo",
        "Ana Administradora",
        "Abierto",
        "2",
      ]),
    );
    expect(celdas).toEqual(
      expect.arrayContaining([
        "$ 30.000,00",
        "$ 0,00",
        "$ 20.000,00",
        "$ 50.000,00",
        "$ 5.000,00",
        "$ 45.000,00",
        "$ 35.000,00",
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

  it("filtra el historial por fecha de apertura (por defecto el mes actual) y muestra los totales del período", async () => {
    responder("v_turnos", "select", { data: [turnoDePrueba()] });
    renderRuta("/admin/ventas", admin());
    await screen.findByTestId("turno-5");
    const { desde, hasta } = mesActual();
    expect(argumentosHistorial("gte")).toEqual(["fecha_apertura", desde]);
    expect(argumentosHistorial("lte")).toEqual(["fecha_apertura", hasta]);
    expect(argumentosRpc("resumen_turnos")).toEqual({ p_desde: desde, p_hasta: hasta });
    // Totales del período: los suma la BD (resumen_turnos); el frontend solo los muestra.
    expect(normal((await screen.findByTestId("rango-Total ventas")).textContent)).toBe(
      "$ 100.000,00",
    );
    expect(normal(screen.getByTestId("rango-Neto").textContent)).toBe("$ 92.000,00");
    expect(screen.getByText(/3 turnos \(1 abiertos\), 7 ventas/)).toBeInTheDocument();

    const campoDesde = screen.getByLabelText("Desde");
    await userEvent.clear(campoDesde);
    await userEvent.type(campoDesde, "2026-01-05");
    await waitFor(() => {
      expect(argumentosHistorial("gte")).toEqual(["fecha_apertura", "2026-01-05"]);
    });
    expect(argumentosRpc("resumen_turnos")).toEqual({ p_desde: "2026-01-05", p_hasta: hasta });
  });

  it("con el rango invertido avisa y no consulta", async () => {
    responder("v_turnos", "select", { data: [] });
    renderRuta("/admin/ventas", admin());
    const campoDesde = await screen.findByLabelText("Desde");
    await userEvent.clear(campoDesde);
    await userEvent.type(campoDesde, "2999-01-01");
    expect(
      await screen.findByText("La fecha “desde” no puede ser posterior a “hasta”."),
    ).toBeInTheDocument();
    expect(argumentosHistorial("gte")).not.toEqual(["fecha_apertura", "2999-01-01"]);
  });

  it("sin turnos en el período ni abiertos muestra los estados vacíos", async () => {
    responder("v_turnos", "select", { data: [] });
    renderRuta("/admin/ventas", admin());
    expect(await screen.findByText("No se abrió ningún turno en esas fechas.")).toBeInTheDocument();
    expect(await screen.findByText(/Abrí uno con/)).toBeInTheDocument();
  });

  it("muestra el error de carga", async () => {
    const error = { code: "42501", message: "permission denied" };
    responder("v_turnos", "select", { error });
    responderAbiertos({ error });
    renderRuta("/admin/ventas", admin());
    expect((await screen.findAllByRole("alert")).length).toBeGreaterThan(0);
  });

  it("'Ver más' pide los turnos anteriores al último por cursor (no por posición)", async () => {
    const pagina = Array.from({ length: TAMANO_PAGINA }, (_, i) => turnoDePrueba({ id: 500 - i }));
    responder("v_turnos", "select", { data: pagina });
    renderRuta("/admin/ventas", admin());
    await screen.findByTestId("turno-500");
    expect(argumentosHistorial("lt")).toBeUndefined();
    expect(argumentosHistorial("order")).toEqual(["id", { ascending: false }]);

    responder("v_turnos", "select", { data: [turnoDePrueba({ id: 7 })] });
    await userEvent.click(screen.getByRole("button", { name: "Ver más turnos" }));
    expect(await screen.findByTestId("turno-7")).toBeInTheDocument();
    expect(argumentosHistorial("lt")).toEqual(["id", 500 - TAMANO_PAGINA + 1]);
    expect(screen.queryByRole("button", { name: "Ver más turnos" })).not.toBeInTheDocument();
  });
});

describe("Ventas (admin): turnos abiertos en vivo", () => {
  it("al entrar muestra los totales y las ventas del turno abierto", async () => {
    responder("v_turnos", "select", { data: [] });
    responderAbiertos({ data: [turnoDePrueba()] });
    responder("ventas", "select", {
      data: [ventaDePrueba({ id: 90, patente: "AB123CD", usuario_id: CAJERO_ID })],
    });
    renderRuta("/admin/ventas", admin());
    const turno = await screen.findByTestId("turno-abierto-5");
    expect(normal(within(turno).getByTestId("vivo-Total ventas").textContent)).toBe("$ 50.000,00");
    expect(normal(within(turno).getByTestId("vivo-Neto").textContent)).toBe("$ 45.000,00");
    expect(normal(within(turno).getByTestId("vivo-efectivo-en-caja").textContent)).toBe(
      "$ 35.000,00",
    );
    expect(await within(turno).findByTestId("venta-90")).toHaveTextContent("AB123CD");
    expect(within(turno).getByRole("button", { name: "Anular venta N° 90" })).toBeInTheDocument();
    expect(within(turno).getByRole("link", { name: "Ver detalle del turno" })).toHaveAttribute(
      "href",
      "/admin/ventas/turnos/5",
    );
  });

  it("con varias cajas abiertas muestra una pestaña por caja", async () => {
    responder("v_turnos", "select", { data: [] });
    responderAbiertos({ data: [turnoDePrueba(), turnoDePrueba({ id: 6, caja_nombre: "Caja 2" })] });
    renderRuta("/admin/ventas", admin());
    const pestanas = await screen.findByRole("tablist", { name: "Turnos abiertos" });
    expect(
      within(pestanas)
        .getAllByRole("tab")
        .map((t) => t.textContent),
    ).toEqual(["Caja 1", "Caja 2"]);
    expect(screen.getByTestId("turno-abierto-5")).toBeInTheDocument();
    await userEvent.click(within(pestanas).getByRole("tab", { name: "Caja 2" }));
    expect(await screen.findByTestId("turno-abierto-6")).toBeInTheDocument();
  });

  it("se suscribe a Realtime y, ante una venta nueva, vuelve a consultar y muestra los totales al día", async () => {
    responder("v_turnos", "select", { data: [] });
    responderAbiertos({ data: [turnoDePrueba()] });
    renderRuta("/admin/ventas", admin());
    const turno = await screen.findByTestId("turno-abierto-5");
    await waitFor(() => {
      expect(screen.getByTestId("estado-en-vivo")).toHaveTextContent("En vivo");
    });
    const abiertos = canales.filter((c) => !c.cerrado);
    expect(abiertos).toHaveLength(1);
    expect(abiertos[0]?.tablas).toEqual([
      "ventas",
      "venta_pagos",
      "gastos",
      "turnos",
      "comprobantes",
    ]);

    responderAbiertos({
      data: [turnoDePrueba({ ventas_cantidad: 3, ventas_total: 70000, neto: 65000 })],
    });
    responder("ventas", "select", { data: [ventaDePrueba({ id: 91 })] });
    emitirCambio("ventas");
    emitirCambio("venta_pagos");
    await waitFor(() => {
      expect(normal(within(turno).getByTestId("vivo-Total ventas").textContent)).toBe(
        "$ 70.000,00",
      );
    });
    expect(await within(turno).findByTestId("venta-91")).toBeInTheDocument();
  });

  it("si se corta la conexión en vivo lo avisa y deja actualizar a mano", async () => {
    responder("v_turnos", "select", { data: [] });
    responderAbiertos({ data: [turnoDePrueba()] });
    renderRuta("/admin/ventas", admin());
    await waitFor(() => {
      expect(screen.getByTestId("estado-en-vivo")).toHaveTextContent("En vivo");
    });
    cambiarEstadoCanales("CHANNEL_ERROR");
    await waitFor(() => {
      expect(screen.getByTestId("estado-en-vivo")).toHaveTextContent("Sin conexión en vivo");
    });

    responderAbiertos({ data: [turnoDePrueba({ ventas_total: 80000 })] });
    await userEvent.click(screen.getByRole("button", { name: "Actualizar" }));
    await waitFor(() => {
      expect(normal(screen.getByTestId("vivo-Total ventas").textContent)).toBe("$ 80.000,00");
    });
  });

  it("al salir de la pantalla cierra el canal de Realtime", async () => {
    responder("v_turnos", "select", { data: [] });
    const { unmount } = renderRuta("/admin/ventas", admin());
    await screen.findByText(/Abrí uno con/);
    unmount();
    expect(canales.length).toBeGreaterThan(0);
    expect(canales.every((c) => c.cerrado)).toBe(true);
  });
});

describe("Ventas (admin): ventas con fecha pasada", () => {
  it("lleva a la pantalla de ventas con fecha pasada", async () => {
    responder("v_turnos", "select", { data: [] });
    responder("ventas", "select", { data: [] });
    renderRuta("/admin/ventas", admin());
    await userEvent.click(await screen.findByRole("link", { name: "Ventas con fecha pasada" }));
    expect(
      await screen.findByRole("heading", { name: "Ventas con fecha pasada" }),
    ).toBeInTheDocument();
  });
});
