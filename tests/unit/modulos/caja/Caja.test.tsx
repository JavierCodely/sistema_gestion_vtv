import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authDePrueba, perfilDePrueba, renderRuta } from "@tests/soporte/render";
import {
  argumentosRpc,
  reiniciarSupabaseFalso,
  responder,
  responderRpc,
} from "@tests/soporte/supabase-falso";

vi.mock("@/compartido/lib/supabase", async () => ({
  supabase: (await import("@tests/soporte/supabase-falso")).supabaseFalso,
}));

const cajero = () => authDePrueba({ perfil: perfilDePrueba() });

beforeEach(() => {
  reiniciarSupabaseFalso();
  responder("v_comprobantes", "select", { data: [] });
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
});

describe("Caja", () => {
  it("sin turno abierto ofrece abrir uno", async () => {
    responder("turnos", "select", { data: null });
    responderRpc("cajas_para_turno", { data: [] });
    renderRuta("/caja", cajero());
    expect(await screen.findByRole("heading", { name: "Abrir turno" })).toBeInTheDocument();
  });

  it("con turno abierto muestra la caja, el formulario y las ventas, sin totales", async () => {
    responder("turnos", "select", {
      data: { id: 5, caja_id: 1, abierto_en: "2026-11-20T12:00:00Z", cajas: { nombre: "Caja 1" } },
    });
    responder("ventas", "select", {
      data: [
        {
          id: 2,
          creado_en: "2026-11-20T12:30:00Z",
          turno_id: 5,
          servicio_nombre: "VTV auto",
          precio: 30000,
          medio_pago: "efectivo",
          patente: "AB123CD",
          sin_stock: false,
          anulada: false,
          anulada_motivo: null,
          anulada_en: null,
        },
        {
          id: 1,
          creado_en: "2026-11-20T12:10:00Z",
          turno_id: 5,
          servicio_nombre: "VTV auto",
          precio: 30000,
          medio_pago: "tarjeta",
          patente: null,
          sin_stock: false,
          anulada: true,
          anulada_motivo: "Error",
          anulada_en: "2026-11-20T12:20:00Z",
        },
      ],
    });
    renderRuta("/caja", cajero());

    expect(await screen.findByRole("heading", { name: "Caja 1" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Nueva venta" })).toBeInTheDocument();
    const ventas = screen.getByRole("region", { name: "Ventas del turno" });
    expect(await within(ventas).findByTestId("venta-2")).toHaveTextContent("AB123CD");
    expect(within(ventas).getByTestId("venta-1")).toHaveTextContent("Anulada");
    // Decisión del negocio: el cajero no ve totales del turno. El único dinero en pantalla es
    // el precio de cada venta, dentro de su fila.
    expect(screen.queryByText(/total/i)).not.toBeInTheDocument();
    // (las <option> del <select> nativo oculto de Radix no se ven ni las lee el lector de pantalla)
    const montos = screen.getAllByText(/\$/, { ignore: "script, style, option" });
    expect(montos).toHaveLength(2);
    for (const monto of montos) expect(monto.closest("[data-testid^='venta-']")).not.toBeNull();
  });

  it("si la venta se rechaza porque el admin cerró el turno, vuelve sola a 'Abrir turno'", async () => {
    responder("turnos", "select", {
      data: { id: 5, caja_id: 1, abierto_en: "2026-11-20T12:00:00Z", cajas: { nombre: "Caja 1" } },
    });
    responder("ventas", "select", { data: [] });
    responderRpc("cajas_para_turno", { data: [] });
    responderRpc("registrar_venta", {
      error: { code: "P0001", message: "Necesitás un turno abierto para vender" },
    });
    renderRuta("/caja", cajero());

    await userEvent.click(await screen.findByLabelText("Servicio"));
    await userEvent.click(await screen.findByRole("option", { name: /^VTV auto/ }));
    await userEvent.click(screen.getByRole("radio", { name: "Efectivo" }));
    // El admin lo cerró mientras tanto
    responder("turnos", "select", { data: null });
    await userEvent.click(screen.getByRole("button", { name: "Registrar venta" }));
    expect(await screen.findByRole("heading", { name: "Abrir turno" })).toBeInTheDocument();
  });

  it("cerrar turno pide observaciones opcionales, sin mostrar totales", async () => {
    responder("turnos", "select", {
      data: { id: 5, caja_id: 1, abierto_en: "2026-11-20T12:00:00Z", cajas: { nombre: "Caja 1" } },
    });
    responder("ventas", "select", { data: [] });
    responderRpc("cerrar_turno", { data: { id: 5 } });
    renderRuta("/caja", cajero());

    await userEvent.click(await screen.findByRole("button", { name: "Cerrar turno" }));
    const dialogo = screen.getByRole("dialog", { name: "Cerrar turno" });
    expect(within(dialogo).queryByText(/total|\$/i)).not.toBeInTheDocument();
    await userEvent.type(within(dialogo).getByLabelText("Observaciones (opcional)"), "Sin novedad");
    await userEvent.click(within(dialogo).getByRole("button", { name: "Cerrar turno" }));
    await vi.waitFor(() => {
      expect(argumentosRpc("cerrar_turno")).toEqual({ p_observaciones: "Sin novedad" });
    });
  });
});
