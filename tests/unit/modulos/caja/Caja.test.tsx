import { screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CLAVE_CAJA_ELEGIDA } from "@/modulos/caja/lib/caja-elegida";
import { authDePrueba, perfilDePrueba, renderRuta } from "@tests/soporte/render";
import {
  argumentosRpc,
  conFiltro,
  reiniciarSupabaseFalso,
  responder,
  responderRpc,
} from "@tests/soporte/supabase-falso";
import { comprobanteDePrueba } from "../facturacion/datos";
import { CAJERO_ID, ventaDePrueba } from "../ventas/datos";

vi.mock("@/compartido/lib/supabase", async () => ({
  supabase: (await import("@tests/soporte/supabase-falso")).supabaseFalso,
}));

/** formatearMoneda separa "$" con un espacio duro: se compara con espacios normales. */
const normal = (texto: string | null | undefined) => (texto ?? "").replace(/\s/g, " ");

const cajero = () => authDePrueba({ perfil: perfilDePrueba() });
const admin = () => authDePrueba({ perfil: perfilDePrueba({ id: "a1", rol: "admin" }) });

const CAJA_1 = { id: 5, caja_id: 1, caja_nombre: "Caja 1", abierto_en: "2026-11-20T12:00:00Z" };
const CAJA_2 = { id: 8, caja_id: 2, caja_nombre: "Caja 2", abierto_en: "2026-11-20T13:00:00Z" };

function cajasAbiertas(cajas: (typeof CAJA_1)[]) {
  responder("v_turnos_abiertos", "select", { data: cajas });
}

/** Recorre la venta con el teclado: patente, categoría, servicio, tarjeta (3) y confirma. */
async function venderConTarjeta() {
  await screen.findByLabelText("1. Patente");
  await userEvent.keyboard("AA111AA{Enter}");
  await screen.findByRole("listbox", { name: "2. Categoría" });
  await userEvent.keyboard("{Enter}");
  await screen.findByRole("listbox", { name: "3. Servicio · Autos" });
  await userEvent.keyboard("{Enter}");
  await screen.findByRole("listbox", { name: "4. Medio de pago" });
  await userEvent.keyboard("3{Enter}");
  await screen.findByTestId("paso-confirmar");
  await userEvent.keyboard("{Enter}");
}

beforeEach(() => {
  reiniciarSupabaseFalso();
  localStorage.clear();
  responder("v_comprobantes", "select", { data: [] });
  responder("v_movimientos_caja", "select", { data: [] });
  responder("ventas", "select", { data: [] });
  responderRpc("condicionales_de_patente", { data: [] });
  responderRpc("ventas_anteriores_de_patente", { data: [] });
  responder("categorias_servicio", "select", { data: [{ id: 1, nombre: "Autos", activa: true }] });
  responder("servicios", "select", {
    data: [
      {
        id: 1,
        nombre: "VTV auto",
        categoria_id: 1,
        precio: 30000,
        requiere_certificado: false,
        activo: true,
        condicional_de: null,
        dias_vuelta: null,
      },
    ],
  });
  responderRpc("descuentos_para_servicio", { data: [] });
  responderRpc("efectivo_en_caja_de_turno", { data: 12500 });
  responderRpc("resumen_ventas_de_turno", {
    data: [
      {
        realizadas_cantidad: 2,
        realizadas_total: 57000,
        anuladas_cantidad: 1,
        anuladas_total: 30000,
      },
    ],
  });
});

describe("Caja: sin cajas abiertas", () => {
  it("el cajero espera que el admin abra una caja", async () => {
    cajasAbiertas([]);
    renderRuta("/caja", cajero());
    expect(
      await screen.findByRole("heading", { name: "No hay cajas abiertas" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Esperá que el administrador abra una caja/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Abrir/ })).not.toBeInTheDocument();
  });

  it("el admin abre una desde la pantalla, sin elegir quién atiende", async () => {
    cajasAbiertas([]);
    responder("v_turnos", "select", { data: [] });
    responderRpc("cajas_para_turno", { data: [] });
    renderRuta("/caja", admin());
    const principal = await screen.findByRole("main");
    await userEvent.click(await within(principal).findByRole("button", { name: "Abrir turno" }));
    const dialogo = await screen.findByRole("dialog", { name: "Abrir turno" });
    expect(within(dialogo).queryByLabelText("Atiende")).not.toBeInTheDocument();
  });
});

describe("Caja: elegir en qué caja se trabaja", () => {
  it("con una sola caja abierta queda elegida y arranca en VENTAS", async () => {
    cajasAbiertas([CAJA_1]);
    renderRuta("/caja", cajero());

    expect(await screen.findByRole("heading", { name: "Caja 1" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Estás trabajando en")).not.toBeInTheDocument();
    const pestanas = screen.getByRole("tablist", { name: "Secciones de la caja" });
    expect(
      within(pestanas)
        .getAllByRole("tab")
        .map((t) => t.textContent),
    ).toEqual(["Ventas", "Historial", "Gastos"]);
    expect(screen.getByRole("tab", { name: "Ventas" })).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByLabelText("1. Patente")).toHaveFocus();
  });

  it("con varias, el usuario elige; la venta va a esa caja y puede cambiar con el selector", async () => {
    cajasAbiertas([CAJA_1, CAJA_2]);
    responderRpc("registrar_venta", {
      data: ventaDePrueba({ id: 40, turno_id: 8, medio_pago: "tarjeta" }),
    });
    renderRuta("/caja", cajero());

    expect(
      await screen.findByRole("heading", { name: "¿En qué caja estás trabajando?" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Caja 2/ }));

    // El selector de arriba muestra dónde está trabajando
    const selector = await screen.findByLabelText("Estás trabajando en");
    expect(selector).toHaveTextContent("Caja 2");
    expect(localStorage.getItem(CLAVE_CAJA_ELEGIDA)).toBe("2");

    await venderConTarjeta();
    await waitFor(() => {
      expect(argumentosRpc("registrar_venta")).toMatchObject({ p_turno_id: 8, p_servicio_id: 1 });
    });

    // Cambia de caja
    await userEvent.click(selector);
    await userEvent.click(await screen.findByRole("option", { name: "Caja 1" }));
    expect(screen.getByLabelText("Estás trabajando en")).toHaveTextContent("Caja 1");
    expect(localStorage.getItem(CLAVE_CAJA_ELEGIDA)).toBe("1");
  });

  it("recuerda la última caja elegida si sigue abierta", async () => {
    localStorage.setItem(CLAVE_CAJA_ELEGIDA, "2");
    cajasAbiertas([CAJA_1, CAJA_2]);
    renderRuta("/caja", cajero());
    expect(await screen.findByLabelText("Estás trabajando en")).toHaveTextContent("Caja 2");
  });

  it("si la recordada ya no está abierta, pide elegir (sin aviso)", async () => {
    localStorage.setItem(CLAVE_CAJA_ELEGIDA, "7");
    cajasAbiertas([CAJA_1, CAJA_2]);
    renderRuta("/caja", cajero());
    expect(
      await screen.findByRole("heading", { name: "¿En qué caja estás trabajando?" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("si la venta responde que la caja se cerró, vuelve a elegir con el mensaje", async () => {
    cajasAbiertas([CAJA_1, CAJA_2]);
    localStorage.setItem(CLAVE_CAJA_ELEGIDA, "1");
    responderRpc("registrar_venta", {
      error: {
        code: "P0001",
        message: 'El turno de la caja "Caja 1" ya se cerró: elegí una caja abierta',
      },
    });
    renderRuta("/caja", cajero());
    await screen.findByLabelText("Estás trabajando en");
    // La lista todavía la muestra (aún no se volvió a leer): igual no se vende más ahí.
    await venderConTarjeta();
    expect(
      await screen.findByRole("heading", { name: "¿En qué caja estás trabajando?" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      'El turno de la caja "Caja 1" ya se cerró: elegí una caja abierta',
    );
    // Elige otra y sigue trabajando
    await userEvent.click(screen.getByRole("button", { name: /Caja 2/ }));
    expect(await screen.findByLabelText("Estás trabajando en")).toHaveTextContent("Caja 2");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("si la caja elegida se cerró y no queda ninguna, avisa y espera", async () => {
    cajasAbiertas([CAJA_1]);
    responderRpc("registrar_venta", {
      error: {
        code: "P0001",
        message: 'El turno de la caja "Caja 1" ya se cerró: elegí una caja abierta',
      },
    });
    renderRuta("/caja", cajero());
    await screen.findByRole("heading", { name: "Caja 1" });
    await screen.findByLabelText("1. Patente");
    // El admin la cerró mientras tanto: al rechazarse la venta se vuelve a leer la lista.
    cajasAbiertas([]);
    await venderConTarjeta();
    expect(
      await screen.findByRole("heading", { name: "No hay cajas abiertas" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("ya se cerró");
  });

  it("si la caja elegida desaparece de la lista de abiertas, vuelve a elegir con un aviso", async () => {
    cajasAbiertas([CAJA_1, CAJA_2]);
    localStorage.setItem(CLAVE_CAJA_ELEGIDA, "2");
    responderRpc("registrar_venta", {
      error: { code: "P0001", message: "El servicio no existe o está desactivado" },
    });
    renderRuta("/caja", cajero());
    await screen.findByLabelText("Estás trabajando en");
    // Cualquier relectura (acá, tras un rechazo) trae la lista sin la caja elegida.
    cajasAbiertas([CAJA_1]);
    await venderConTarjeta();
    expect(
      await screen.findByRole("heading", { name: "¿En qué caja estás trabajando?" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "El turno de la caja “Caja 2” se cerró: elegí una caja abierta.",
    );
    // No pasa sola a la otra caja (es otro cajón), aunque sea la única abierta.
    expect(screen.getByRole("button", { name: /Caja 1/ })).toBeInTheDocument();
  });
});

describe("Caja: historial y gastos de la caja (de todos; el único total es el efectivo en caja)", () => {
  it("HISTORIAL muestra las ventas de la caja con quién vendió, el medio mixto y el descuento", async () => {
    cajasAbiertas([CAJA_1]);
    responder("ventas", "select", {
      data: [
        ventaDePrueba({
          id: 3,
          creado_en: "2026-11-20T12:40:00Z",
          usuario_id: "a1",
          precio: 27000,
          precio_lista: 30000,
          monto_descuento: 3000,
          descuento_nombre: "Jubilados",
          medio_pago: null,
          venta_pagos: [
            { medio: "tarjeta", monto: 22000 },
            { medio: "efectivo", monto: 5000 },
          ],
        }),
        ventaDePrueba({
          id: 2,
          patente: "AB123CD",
          certificados: { nombre: "Hoja B", condicional: true },
        }),
        ventaDePrueba({
          id: 1,
          creado_en: "2026-11-20T12:10:00Z",
          medio_pago: "tarjeta",
          anulada: true,
          anulada_motivo: "Error",
          anulada_en: "2026-11-20T12:20:00Z",
          anulada_por: "a1",
        }),
      ],
    });
    responder(
      "rpc:nombre_usuario",
      "rpc",
      { data: "Ana Administradora" },
      { cuando: conFiltro("rpc", { p_usuario_id: "a1" }) },
    );
    responder(
      "rpc:nombre_usuario",
      "rpc",
      { data: "Cajero Prueba" },
      { cuando: conFiltro("rpc", { p_usuario_id: CAJERO_ID }) },
    );
    renderRuta("/caja", cajero());

    await userEvent.click(await screen.findByRole("tab", { name: "Historial" }));
    const ventas = await screen.findByRole("region", { name: "Ventas de la caja" });
    expect(within(ventas).getByRole("columnheader", { name: "Vendió" })).toBeInTheDocument();
    expect(await within(ventas).findByTestId("venta-2")).toHaveTextContent("AB123CD");
    await waitFor(() => {
      expect(within(ventas).getByTestId("venta-3")).toHaveTextContent("Ana Administradora");
    });
    expect(within(ventas).getByTestId("venta-2")).toHaveTextContent("Cajero Prueba");
    expect(within(ventas).getByTestId("venta-1")).toHaveTextContent("Anulada");
    // El certificado entregado (la condicional, marcada); sin certificado, "—".
    expect(within(ventas).getByRole("columnheader", { name: "Certificado" })).toBeInTheDocument();
    expect(within(ventas).getByTestId("venta-2")).toHaveTextContent("Hoja BCondicional");
    expect(within(ventas).getByTestId("venta-1")).toHaveTextContent("Anuló: Ana Administradora");
    // El cajero anula solo sus ventas sin anular (la del admin y la anulada no tienen el botón).
    expect(within(ventas).getByRole("button", { name: "Anular venta N° 2" })).toBeInTheDocument();
    expect(within(ventas).queryByRole("button", { name: "Anular venta N° 3" })).toBeNull();
    expect(within(ventas).queryByRole("button", { name: "Anular venta N° 1" })).toBeNull();
    // Pago mixto: "Mixto" con el detalle por medio (en orden: efectivo, transferencia, tarjeta);
    // el descuento con su nombre, lo descontado y el precio de lista.
    const mixta = within(ventas).getByTestId("venta-3");
    expect(normal(mixta.textContent)).toContain("MixtoEfectivo $ 5.000,00 + Tarjeta $ 22.000,00");
    expect(normal(mixta.textContent)).toContain("Jubilados−$ 3.000,00 · lista $ 30.000,00");
    expect(normal(mixta.textContent)).toContain("$ 27.000,00");
    // Decisiones del negocio (2026-11-24 y 2026-11-25): de dinero del turno, el cajero ve solo el
    // efectivo en caja y el total de realizadas y anuladas (los calcula la BD). El resto del dinero en
    // pantalla es el de cada venta, dentro de su fila: nada de totales por medio, gastos ni neto.
    await waitFor(() => {
      expect(normal(screen.getByTestId("efectivo-en-caja").textContent)).toBe(
        "Efectivo en caja$ 12.500,00",
      );
    });
    expect(argumentosRpc("efectivo_en_caja_de_turno")).toEqual({ p_turno_id: 5 });
    expect(normal(screen.getByTestId("total-realizadas").textContent)).toBe(
      "Realizadas$ 57.000,002 ventas",
    );
    expect(normal(screen.getByTestId("total-anuladas").textContent)).toBe(
      "Anuladas$ 30.000,001 venta",
    );
    expect(argumentosRpc("resumen_ventas_de_turno")).toEqual({ p_turno_id: 5 });
    expect(screen.queryByText(/total/i)).not.toBeInTheDocument();
    // (las <option> del <select> nativo oculto de Radix no se ven ni las lee el lector de pantalla)
    const montos = screen.getAllByText(/\$/, { ignore: "script, style, option" });
    expect(montos).toHaveLength(8);
    for (const monto of montos) {
      expect(
        monto.closest("[data-testid^='venta-']") ??
          monto.closest("[data-testid='efectivo-en-caja']") ??
          monto.closest("[data-testid^='total-']"),
      ).not.toBeNull();
    }
  });

  it("HISTORIAL: en Estado, la vuelta fuera de plazo y la condicional vencida que se cobró de nuevo", async () => {
    cajasAbiertas([CAJA_1]);
    responder("ventas", "select", {
      data: [
        ventaDePrueba({ id: 3, vuelta_de: 70, vuelta_fuera_de_plazo: true }),
        ventaDePrueba({ id: 2, vuelta_de: 71 }),
        ventaDePrueba({ id: 1, condicional_vencida_de: 72 }),
      ],
    });
    responderRpc("nombre_usuario", { data: "Cajero Prueba" });
    renderRuta("/caja", cajero());
    await userEvent.click(await screen.findByRole("tab", { name: "Historial" }));
    const ventas = await screen.findByRole("region", { name: "Ventas de la caja" });
    expect(await within(ventas).findByTestId("venta-3")).toHaveTextContent(
      "Vuelta de condicional fuera de plazo",
    );
    expect(within(ventas).getByTestId("venta-2")).toHaveTextContent("Vuelta de condicional");
    expect(within(ventas).getByTestId("venta-2")).not.toHaveTextContent("fuera de plazo");
    expect(within(ventas).getByTestId("venta-1")).toHaveTextContent(
      "Condicional vencida: se cobró de nuevo",
    );
  });

  it("HISTORIAL busca por patente desde 3 caracteres, solo en las ventas del turno", async () => {
    cajasAbiertas([CAJA_1]);
    responder("ventas", "select", {
      data: [
        ventaDePrueba({ id: 3, patente: "AB123CD" }),
        ventaDePrueba({ id: 2, patente: "AC456EF" }),
        ventaDePrueba({ id: 1, patente: "AB999ZZ" }),
      ],
    });
    responderRpc("nombre_usuario", { data: "Cajero Prueba" });
    renderRuta("/caja", cajero());

    await userEvent.click(await screen.findByRole("tab", { name: "Historial" }));
    const ventas = await screen.findByRole("region", { name: "Ventas de la caja" });
    await within(ventas).findByTestId("venta-3");
    const buscar = within(ventas).getByLabelText("Buscar patente");
    // Con menos de 3 caracteres se ven todas.
    await userEvent.type(buscar, "a b");
    expect(within(ventas).getAllByTestId(/^venta-/)).toHaveLength(3);
    // Desde 3 (sin espacios, en mayúsculas): las que empiezan así.
    await userEvent.type(buscar, "1");
    expect(
      within(ventas)
        .getAllByTestId(/^venta-/)
        .map((fila) => fila.dataset.testid),
    ).toEqual(["venta-3"]);
    await userEvent.clear(buscar);
    await userEvent.type(buscar, "zz9");
    expect(
      within(ventas).getByText("No hay ventas en este turno con esos filtros."),
    ).toBeInTheDocument();
    await userEvent.clear(buscar);
    expect(within(ventas).getAllByTestId(/^venta-/)).toHaveLength(3);
  });

  it("HISTORIAL filtra por categoría y por medio de pago (una mixta aparece en cada medio que usó)", async () => {
    cajasAbiertas([CAJA_1]);
    responder("ventas", "select", {
      data: [
        ventaDePrueba({ id: 3, categoria_id: 1, categorias_servicio: { nombre: "Autos" } }),
        ventaDePrueba({
          id: 2,
          categoria_id: 2,
          categorias_servicio: { nombre: "Motos" },
          medio_pago: "tarjeta",
        }),
        ventaDePrueba({
          id: 1,
          categoria_id: 1,
          categorias_servicio: { nombre: "Autos" },
          medio_pago: null,
          precio: 18000,
          venta_pagos: [
            { medio: "efectivo", monto: 5000 },
            { medio: "tarjeta", monto: 13000 },
          ],
        }),
      ],
    });
    responderRpc("nombre_usuario", { data: "Cajero Prueba" });
    renderRuta("/caja", cajero());

    await userEvent.click(await screen.findByRole("tab", { name: "Historial" }));
    const ventas = await screen.findByRole("region", { name: "Ventas de la caja" });
    await within(ventas).findByTestId("venta-3");
    const ids = () =>
      within(ventas)
        .getAllByTestId(/^venta-/)
        .map((fila) => fila.dataset.testid);

    await userEvent.click(within(ventas).getByRole("combobox", { name: "Categoría" }));
    await userEvent.click(await screen.findByRole("option", { name: "Autos" }));
    expect(ids()).toEqual(["venta-3", "venta-1"]);

    await userEvent.click(within(ventas).getByRole("combobox", { name: "Medio de pago" }));
    await userEvent.click(await screen.findByRole("option", { name: "Tarjeta" }));
    // Autos + tarjeta: solo la mixta (efectivo + tarjeta).
    expect(ids()).toEqual(["venta-1"]);

    await userEvent.click(within(ventas).getByRole("button", { name: "Limpiar filtros" }));
    expect(ids()).toEqual(["venta-3", "venta-2", "venta-1"]);

    await userEvent.click(within(ventas).getByRole("combobox", { name: "Medio de pago" }));
    await userEvent.click(await screen.findByRole("option", { name: "Mixto" }));
    expect(ids()).toEqual(["venta-1"]);
  });

  it("HISTORIAL: el cajero anula su venta con motivo y la nota de crédito queda para el admin", async () => {
    cajasAbiertas([CAJA_1]);
    responder("ventas", "select", { data: [ventaDePrueba({ id: 2, medio_pago: "tarjeta" })] });
    responder("v_comprobantes", "select", {
      data: [comprobanteDePrueba({ id: 40, venta_id: 2 })],
    });
    responderRpc("nombre_usuario", { data: "Cajero Prueba" });
    responderRpc("anular_venta", { data: { id: 2, anulada: true } });
    renderRuta("/caja", cajero());

    await userEvent.click(await screen.findByRole("tab", { name: "Historial" }));
    await userEvent.click(await screen.findByRole("button", { name: "Anular venta N° 2" }));
    const dialogo = await screen.findByRole("dialog", { name: "Anular venta N° 2" });
    expect(dialogo).toHaveTextContent(
      "Está facturada: la nota de crédito queda pendiente y la emite el administrador.",
    );
    await userEvent.type(within(dialogo).getByLabelText("Motivo"), "Se cargó mal");
    await userEvent.click(within(dialogo).getByRole("button", { name: "Anular venta" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(argumentosRpc("anular_venta")).toEqual({ p_venta_id: 2, p_motivo: "Se cargó mal" });
  });

  it("HISTORIAL: el admin atendiendo la caja puede anular cualquier venta", async () => {
    cajasAbiertas([CAJA_1]);
    responder("ventas", "select", { data: [ventaDePrueba({ id: 2 })] });
    responderRpc("nombre_usuario", { data: "Cajero Prueba" });
    renderRuta("/caja", admin());
    await userEvent.click(await screen.findByRole("tab", { name: "Historial" }));
    expect(await screen.findByRole("button", { name: "Anular venta N° 2" })).toBeInTheDocument();
  });

  it("GASTOS muestra los gastos de la caja con quién los cargó, sin totales, y permite registrar uno", async () => {
    cajasAbiertas([CAJA_1]);
    responder("v_movimientos_caja", "select", {
      data: [
        {
          id: 9,
          fecha: "2026-11-20T13:00:00Z",
          turno_id: 5,
          caja_nombre: "Caja 1",
          usuario_nombre: "Ana Administradora",
          concepto: "Café y bebidas",
          detalle: "Comida y refrigerio",
          medio: "efectivo",
          monto: -1500,
          nota: "Café",
          anulada: false,
          motivo_anulacion: null,
          categoria_gasto_id: 3,
        },
      ],
    });
    renderRuta("/caja", cajero());

    await userEvent.click(await screen.findByRole("tab", { name: "Gastos" }));
    const gastos = await screen.findByRole("region", { name: "Gastos de la caja" });
    const fila = await within(gastos).findByTestId("gasto-9");
    expect(within(gastos).getByRole("columnheader", { name: "Cargó" })).toBeInTheDocument();
    expect(fila).toHaveTextContent("Ana Administradora");
    expect(fila).toHaveTextContent("Café y bebidas");
    expect(fila).toHaveTextContent("$ 1.500,00");
    expect(screen.queryByText(/total|saldo/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Registrar gasto" })).toBeInTheDocument();
  });
});
