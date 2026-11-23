import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VentaPasada } from "@/modulos/ventas/api/consultas";
import { authDePrueba, perfilDePrueba, renderRuta } from "@tests/soporte/render";
import {
  argumentosDe,
  argumentosRpc,
  reiniciarSupabaseFalso,
  responder,
  responderRpc,
} from "@tests/soporte/supabase-falso";
import { ventaDePrueba } from "./datos";

vi.mock("@/compartido/lib/supabase", async () => ({
  supabase: (await import("@tests/soporte/supabase-falso")).supabaseFalso,
}));

const admin = () => authDePrueba({ perfil: perfilDePrueba({ rol: "admin" }) });
const normal = (texto: string | null) => (texto ?? "").replace(/\s/g, " ");

function ventaPasada(cambios: Partial<VentaPasada> = {}): VentaPasada {
  return {
    ...ventaDePrueba({ turno_id: null, creado_en: "2026-11-01T13:30:00Z" }),
    cargada_en: "2026-11-21T15:00:00Z",
    cajas: { nombre: "Caja 1" },
    ...cambios,
  };
}

beforeEach(() => {
  reiniciarSupabaseFalso();
  // Al anular, se busca la nota de crédito a emitir: sin factura no hay.
  responder("comprobantes", "select", { data: null });
  responder("cajas", "select", {
    data: [
      { id: 1, nombre: "Caja 1", activa: true },
      { id: 2, nombre: "Caja vieja", activa: false },
    ],
  });
  // Sin cajas abiertas: se propone la única caja activa
  responder("v_turnos_abiertos", "select", { data: [] });
  responder("servicios", "select", {
    data: [
      {
        id: 7,
        nombre: "VTV auto",
        categoria_id: 1,
        precio: 20000,
        requiere_certificado: true,
        activo: true,
      },
      {
        id: 8,
        nombre: "VTV moto",
        categoria_id: 1,
        precio: 12500.5,
        requiere_certificado: true,
        activo: false,
      },
    ],
  });
});

describe("VentasPasadas (admin)", () => {
  it("lista solo ventas sin turno, con su fecha, caja y cuándo se cargaron", async () => {
    responder("ventas", "select", {
      data: [
        ventaPasada({ id: 90, medio_pago: "tarjeta", patente: "AB123CD" }),
        ventaPasada({ id: 89, anulada: true, anulada_motivo: "Duplicada" }),
      ],
    });
    renderRuta("/admin/ventas/pasadas", admin());

    const fila = await screen.findByTestId("venta-pasada-90");
    expect(within(fila).getByText("01/11/2026, 10:30")).toBeInTheDocument();
    expect(within(fila).getByText("21/11/2026, 12:00")).toBeInTheDocument();
    expect(within(fila).getByText("Caja 1")).toBeInTheDocument();
    expect(within(fila).getByText("AB123CD")).toBeInTheDocument();
    expect(within(fila).getByText("Tarjeta")).toBeInTheDocument();
    expect(normal(within(fila).getByText(/30\.000/).textContent)).toBe("$ 30.000,00");
    expect(within(fila).getByRole("button", { name: "Anular venta N° 90" })).toBeInTheDocument();

    const anulada = screen.getByTestId("venta-pasada-89");
    expect(within(anulada).getByText("Anulada")).toBeInTheDocument();
    expect(within(anulada).getByText("Duplicada")).toBeInTheDocument();
    expect(within(anulada).queryByRole("button")).not.toBeInTheDocument();

    expect(argumentosDe("ventas", "select", "is")).toEqual(["turno_id", null]);
    // Nunca `*`: los costos no son legibles.
    expect(argumentosDe("ventas", "select")?.[0]).not.toContain("*");
  });

  it("sin ventas muestra el estado vacío", async () => {
    responder("ventas", "select", { data: [] });
    renderRuta("/admin/ventas/pasadas", admin());
    expect(
      await screen.findByText("Todavía no se cargó ninguna venta con fecha pasada."),
    ).toBeInTheDocument();
  });

  it("el formulario exige los datos antes de llamar a la BD", async () => {
    responder("ventas", "select", { data: [] });
    renderRuta("/admin/ventas/pasadas", admin());
    await userEvent.click(await screen.findByRole("button", { name: "Cargar venta" }));
    const dialogo = await screen.findByRole("dialog", { name: "Cargar venta con fecha pasada" });
    await userEvent.click(within(dialogo).getByRole("button", { name: "Cargar venta" }));

    expect(within(dialogo).getByText("Elegí la fecha de la venta.")).toBeInTheDocument();
    // La hora es opcional y la caja ya viene propuesta (la única activa)
    expect(within(dialogo).getByText("Vacía: queda a las 00:00 de ese día.")).toBeInTheDocument();
    expect(within(dialogo).queryByText("Elegí una caja.")).not.toBeInTheDocument();
    expect(within(dialogo).getByLabelText("Caja")).toHaveTextContent("Caja 1");
    expect(within(dialogo).getByText("Elegí un servicio.")).toBeInTheDocument();
    expect(within(dialogo).getByText("Elegí el medio de pago.")).toBeInTheDocument();
    expect(within(dialogo).getByText("Ingresá un precio.")).toBeInTheDocument();
    expect(argumentosRpc("registrar_venta_pasada")).toBeUndefined();
  });

  it("carga la venta: propone el precio del servicio y ofrece cajas y servicios desactivados", async () => {
    responder("ventas", "select", { data: [] });
    responderRpc("registrar_venta_pasada", {
      data: { id: 95, servicio_nombre: "VTV moto", precio: 11000 },
    });
    renderRuta("/admin/ventas/pasadas", admin());
    await userEvent.click(await screen.findByRole("button", { name: "Cargar venta" }));
    const dialogo = await screen.findByRole("dialog", { name: "Cargar venta con fecha pasada" });

    fireEvent.change(within(dialogo).getByLabelText("Fecha"), { target: { value: "2026-10-15" } });
    fireEvent.change(within(dialogo).getByLabelText("Hora (opcional)"), {
      target: { value: "18:45" },
    });
    await userEvent.click(within(dialogo).getByLabelText("Caja"));
    await userEvent.click(await screen.findByRole("option", { name: "Caja vieja (desactivada)" }));
    await userEvent.click(within(dialogo).getByLabelText("Servicio"));
    await userEvent.click(await screen.findByRole("option", { name: "VTV moto (desactivado)" }));
    const precio = within(dialogo).getByLabelText("Precio ($)");
    expect(precio).toHaveValue("12500,50");
    await userEvent.clear(precio);
    await userEvent.type(precio, "11.000");
    await userEvent.click(within(dialogo).getByLabelText("Medio de pago"));
    await userEvent.click(await screen.findByRole("option", { name: "Efectivo" }));
    await userEvent.type(within(dialogo).getByLabelText("Patente (opcional)"), "ab 123 cd");
    await userEvent.click(within(dialogo).getByRole("button", { name: "Cargar venta" }));

    await waitFor(() => {
      expect(argumentosRpc("registrar_venta_pasada")).toEqual({
        p_fecha: "2026-10-15",
        p_hora: "18:45",
        p_caja_id: 2,
        p_servicio_id: 8,
        p_medio_pago: "efectivo",
        p_precio: 11000,
        p_patente: "AB123CD",
      });
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("propone la caja con turno abierto y, sin hora, manda las 00:00", async () => {
    responder("ventas", "select", { data: [] });
    responder("v_turnos_abiertos", "select", {
      data: [{ id: 40, caja_id: 2, caja_nombre: "Caja vieja", abierto_en: "2026-11-23T11:00:00Z" }],
    });
    responderRpc("registrar_venta_pasada", {
      data: { id: 96, servicio_nombre: "VTV auto", precio: 20000 },
    });
    renderRuta("/admin/ventas/pasadas", admin());
    await userEvent.click(await screen.findByRole("button", { name: "Cargar venta" }));
    const dialogo = await screen.findByRole("dialog", { name: "Cargar venta con fecha pasada" });

    await waitFor(() => {
      expect(within(dialogo).getByLabelText("Caja")).toHaveTextContent("Caja vieja");
    });
    fireEvent.change(within(dialogo).getByLabelText("Fecha"), { target: { value: "2026-10-15" } });
    await userEvent.click(within(dialogo).getByLabelText("Servicio"));
    await userEvent.click(await screen.findByRole("option", { name: "VTV auto" }));
    await userEvent.click(within(dialogo).getByLabelText("Medio de pago"));
    await userEvent.click(await screen.findByRole("option", { name: "Tarjeta" }));
    await userEvent.click(within(dialogo).getByRole("button", { name: "Cargar venta" }));

    await waitFor(() => {
      expect(argumentosRpc("registrar_venta_pasada")).toMatchObject({
        p_fecha: "2026-10-15",
        p_hora: "00:00",
        p_caja_id: 2,
      });
    });
  });

  it("muestra el error de la BD sin cerrar el formulario", async () => {
    responder("ventas", "select", { data: [] });
    responderRpc("registrar_venta_pasada", {
      error: {
        code: "22023",
        message: "La fecha y hora de la venta tienen que ser anteriores a este momento",
      },
    });
    renderRuta("/admin/ventas/pasadas", admin());
    await userEvent.click(await screen.findByRole("button", { name: "Cargar venta" }));
    const dialogo = await screen.findByRole("dialog", { name: "Cargar venta con fecha pasada" });

    fireEvent.change(within(dialogo).getByLabelText("Fecha"), { target: { value: "2026-10-15" } });
    fireEvent.change(within(dialogo).getByLabelText("Hora (opcional)"), {
      target: { value: "18:45" },
    });
    await userEvent.click(within(dialogo).getByLabelText("Caja"));
    await userEvent.click(await screen.findByRole("option", { name: "Caja 1" }));
    await userEvent.click(within(dialogo).getByLabelText("Servicio"));
    await userEvent.click(await screen.findByRole("option", { name: "VTV auto" }));
    await userEvent.click(within(dialogo).getByLabelText("Medio de pago"));
    await userEvent.click(await screen.findByRole("option", { name: "Tarjeta" }));
    await userEvent.click(within(dialogo).getByRole("button", { name: "Cargar venta" }));

    expect(
      await within(dialogo).findByText(
        "La fecha y hora de la venta tienen que ser anteriores a este momento",
      ),
    ).toBeInTheDocument();
    expect(argumentosRpc("registrar_venta_pasada")).toMatchObject({ p_precio: 20000 });
  });

  it("anula una venta pasada (el efectivo sale de la caja de cambio)", async () => {
    responder("ventas", "select", { data: [ventaPasada({ id: 90 })] });
    responderRpc("anular_venta", { data: { id: 90, anulada: true } });
    renderRuta("/admin/ventas/pasadas", admin());

    await userEvent.click(await screen.findByRole("button", { name: "Anular venta N° 90" }));
    const dialogo = screen.getByRole("dialog", { name: "Anular venta N° 90" });
    expect(
      within(dialogo).getByText(/Como fue en efectivo, el monto sale de la caja de cambio\./),
    ).toBeInTheDocument();
    await userEvent.type(within(dialogo).getByLabelText("Motivo"), "Cargada dos veces");
    await userEvent.click(within(dialogo).getByRole("button", { name: "Anular venta" }));
    await waitFor(() => {
      expect(argumentosRpc("anular_venta")).toEqual({
        p_venta_id: 90,
        p_motivo: "Cargada dos veces",
      });
    });
  });
});
