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

/** Recorre la venta con el teclado hasta el medio de pago y elige tarjeta (3). */
async function venderConTarjeta() {
  await screen.findByRole("listbox", { name: "1. Categoría" });
  await userEvent.keyboard("{Enter}");
  await screen.findByRole("listbox", { name: "2. Servicio · Autos" });
  await userEvent.keyboard("{Enter}");
  await screen.findByLabelText("3. Patente");
  await userEvent.keyboard("AA111AA{Enter}");
  await screen.findByRole("listbox", { name: "4. Medio de pago" });
  await userEvent.keyboard("3{Enter}");
}

beforeEach(() => {
  reiniciarSupabaseFalso();
  localStorage.clear();
  responder("v_comprobantes", "select", { data: [] });
  responder("v_movimientos_caja", "select", { data: [] });
  responder("ventas", "select", { data: [] });
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
      },
    ],
  });
  responderRpc("descuentos_para_servicio", { data: [] });
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
    expect(await screen.findByRole("listbox", { name: "1. Categoría" })).toHaveFocus();
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
    await screen.findByRole("listbox", { name: "1. Categoría" });
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

describe("Caja: historial y gastos de la caja (de todos, sin totales)", () => {
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
        ventaDePrueba({ id: 2, patente: "AB123CD" }),
        ventaDePrueba({
          id: 1,
          creado_en: "2026-11-20T12:10:00Z",
          medio_pago: "tarjeta",
          anulada: true,
          anulada_motivo: "Error",
          anulada_en: "2026-11-20T12:20:00Z",
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
    // Pago mixto: "Mixto" con el detalle por medio (en orden: efectivo, transferencia, tarjeta);
    // el descuento con su nombre, lo descontado y el precio de lista.
    const mixta = within(ventas).getByTestId("venta-3");
    expect(normal(mixta.textContent)).toContain("MixtoEfectivo $ 5.000,00 + Tarjeta $ 22.000,00");
    expect(normal(mixta.textContent)).toContain("Jubilados−$ 3.000,00 · lista $ 30.000,00");
    expect(normal(mixta.textContent)).toContain("$ 27.000,00");
    // Decisión del negocio: el cajero no ve totales. El único dinero en pantalla es el de cada
    // venta, dentro de su fila.
    expect(screen.queryByText(/total/i)).not.toBeInTheDocument();
    // (las <option> del <select> nativo oculto de Radix no se ven ni las lee el lector de pantalla)
    const montos = screen.getAllByText(/\$/, { ignore: "script, style, option" });
    expect(montos).toHaveLength(5);
    for (const monto of montos) expect(monto.closest("[data-testid^='venta-']")).not.toBeNull();
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
