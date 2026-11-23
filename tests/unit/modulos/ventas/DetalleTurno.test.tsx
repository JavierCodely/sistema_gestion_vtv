import { screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authDePrueba, perfilDePrueba, renderRuta } from "@tests/soporte/render";
import {
  argumentosRpc,
  conFiltro,
  reiniciarSupabaseFalso,
  responder,
  responderRpc,
} from "@tests/soporte/supabase-falso";
import { comprobanteDePrueba } from "../facturacion/datos";
import { CAJERO_ID, turnoDePrueba, ventaDePrueba } from "./datos";

vi.mock("@/compartido/lib/supabase", async () => ({
  supabase: (await import("@tests/soporte/supabase-falso")).supabaseFalso,
}));

const admin = () => authDePrueba({ perfil: perfilDePrueba({ rol: "admin" }) });
const normal = (texto: string | null) => (texto ?? "").replace(/\s/g, " ");

beforeEach(() => {
  reiniciarSupabaseFalso();
  // La barra fija lista los turnos abiertos (misma vista, con `.eq("abierto", true)`).
  responder("v_turnos", "select", { data: [] }, { cuando: conFiltro("eq", "abierto", true) });
  responder("v_comprobantes", "select", { data: [] });
  responder(
    "rpc:nombre_usuario",
    "rpc",
    { data: "Carlos Demo" },
    { cuando: conFiltro("rpc", { p_usuario_id: CAJERO_ID }) },
  );
  responder(
    "rpc:nombre_usuario",
    "rpc",
    { data: "Ana Administradora" },
    { cuando: conFiltro("rpc", { p_usuario_id: "a1" }) },
  );
  // Al anular, se busca la nota de crédito a emitir: sin factura no hay.
  responder("comprobantes", "select", { data: null });
  responder("ventas", "select", {
    data: [
      ventaDePrueba({ id: 82, medio_pago: "tarjeta", precio: 20000, usuario_id: "a1" }),
      ventaDePrueba({ id: 81, anulada: true, anulada_motivo: "Duplicada" }),
    ],
  });
});

describe("DetalleTurno (admin)", () => {
  it("muestra los totales, las observaciones y deja anular solo las ventas vigentes", async () => {
    responder("v_turnos", "select", {
      data: turnoDePrueba({
        abierto: false,
        cerrado_en: "2026-11-20T20:00:00Z",
        observaciones: "Sin novedad",
        // Foto del cierre: después se anuló una venta en efectivo de 5.000 (en vivo quedan 30.000)
        total_efectivo: 35000,
        efectivo_cierre: 40000,
        efectivo_en_caja: 40000,
      }),
    });
    renderRuta("/admin/ventas/turnos/5", admin());

    expect(normal((await screen.findByTestId("total-Neto")).textContent)).toBe("$ 45.000,00");
    expect(normal(screen.getByTestId("total-Tarjeta").textContent)).toBe("$ 20.000,00");
    expect(normal(screen.getByTestId("total-Gastos").textContent)).toBe("$ 5.000,00");
    expect(screen.getByText("Observaciones: Sin novedad")).toBeInTheDocument();
    // Turno cerrado: la foto del cierre por un lado y lo de hoy (en vivo) por otro, sin mezclarlos
    expect(screen.getByRole("heading", { name: "Al cerrar el turno" })).toBeInTheDocument();
    expect(normal(screen.getByTestId("efectivo-inicial").textContent)).toBe("$ 10.000,00");
    expect(normal(screen.getByTestId("efectivo-ventas-cierre").textContent)).toBe("$ 35.000,00");
    expect(normal(screen.getByTestId("efectivo-en-caja").textContent)).toBe("$ 40.000,00");
    expect(screen.getByText("Efectivo devuelto al cerrar")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Hoy, sin anuladas" })).toBeInTheDocument();
    expect(normal(screen.getByTestId("efectivo-ventas").textContent)).toBe("$ 30.000,00");
    expect(normal(screen.getByTestId("efectivo-gastos").textContent)).toBe("$ 5.000,00");
    expect(
      screen.getByText(/Lo que se anuló después del cierre salió de la caja de cambio/),
    ).toBeInTheDocument();
    // Cerrado: no se puede volver a cerrar
    expect(screen.queryByRole("button", { name: "Cerrar este turno" })).not.toBeInTheDocument();

    expect(
      within(await screen.findByTestId("venta-82")).getByRole("button", {
        name: "Anular venta N° 82",
      }),
    ).toBeInTheDocument();
    expect(within(screen.getByTestId("venta-81")).queryByRole("button")).not.toBeInTheDocument();

    responderRpc("anular_venta", { data: { id: 82, anulada: true } });
    await userEvent.click(screen.getByRole("button", { name: "Anular venta N° 82" }));
    const dialogo = screen.getByRole("dialog", { name: "Anular venta N° 82" });
    await userEvent.type(within(dialogo).getByLabelText("Motivo"), "Error de cobro");
    await userEvent.click(within(dialogo).getByRole("button", { name: "Anular venta" }));
    await waitFor(() => {
      expect(argumentosRpc("anular_venta")).toEqual({ p_venta_id: 82, p_motivo: "Error de cobro" });
    });
  });

  it("cierra el turno ajeno que quedó abierto (sin observaciones no las manda)", async () => {
    responder("v_turnos", "select", { data: turnoDePrueba() });
    responderRpc("cerrar_turno", { data: { id: 5 } });
    renderRuta("/admin/ventas/turnos/5", admin());

    await userEvent.click(await screen.findByRole("button", { name: "Cerrar este turno" }));
    const dialogo = screen.getByRole("dialog", { name: "Cerrar turno" });
    await userEvent.click(within(dialogo).getByRole("button", { name: "Cerrar turno" }));
    await waitFor(() => {
      expect(argumentosRpc("cerrar_turno")).toEqual({ p_turno_id: 5 });
    });
  });

  it("el turno es de la caja: muestra quién lo abrió, quiénes atendieron y quién hizo cada venta", async () => {
    responder("v_turnos", "select", { data: turnoDePrueba() });
    renderRuta("/admin/ventas/turnos/5", admin());
    expect(await screen.findByRole("heading", { name: /^Caja 1/ })).toBeInTheDocument();
    expect(screen.getByText(/por Ana Administradora/)).toBeInTheDocument();
    expect(screen.getByText("Atendieron: Ana Administradora y Carlos Demo")).toBeInTheDocument();
    expect(await screen.findByRole("columnheader", { name: "Vendió" })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId("venta-82")).toHaveTextContent("Ana Administradora");
    });
    expect(screen.getByTestId("venta-81")).toHaveTextContent("Carlos Demo");
  });

  it("un turno abierto muestra el efectivo en caja en vivo, sin la foto del cierre", async () => {
    responder("v_turnos", "select", { data: turnoDePrueba() });
    renderRuta("/admin/ventas/turnos/5", admin());
    expect(normal((await screen.findByTestId("efectivo-en-caja")).textContent)).toBe("$ 35.000,00");
    expect(screen.getByText("Efectivo en caja")).toBeInTheDocument();
    expect(normal(screen.getByTestId("efectivo-ventas").textContent)).toBe("$ 30.000,00");
    expect(normal(screen.getByTestId("efectivo-gastos").textContent)).toBe("$ 5.000,00");
    expect(screen.queryByRole("heading", { name: "Al cerrar el turno" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("efectivo-ventas-cierre")).not.toBeInTheDocument();
  });

  it("un turno inexistente o un id inválido lo dicen", async () => {
    responder("v_turnos", "select", { data: null });
    const { unmount } = renderRuta("/admin/ventas/turnos/999", admin());
    expect(await screen.findByText("El turno no existe.")).toBeInTheDocument();
    unmount();
    renderRuta("/admin/ventas/turnos/abc", admin());
    expect(await screen.findByText("El turno no existe.")).toBeInTheDocument();
  });

  it("muestra el error de carga", async () => {
    responder("v_turnos", "select", { error: { code: "42501", message: "permission denied" } });
    renderRuta("/admin/ventas/turnos/5", admin());
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("muestra el estado de facturación de cada venta", async () => {
    responder("v_turnos", "select", { data: turnoDePrueba() });
    responder("v_comprobantes", "select", {
      data: [
        comprobanteDePrueba({ venta_id: 82 }),
        comprobanteDePrueba({
          id: 11,
          venta_id: 81,
          estado: "rechazado",
          numero: null,
          cae: null,
        }),
      ],
    });
    renderRuta("/admin/ventas/turnos/5", admin());
    expect(
      await within(await screen.findByTestId("venta-82")).findByRole("link", {
        name: "Ver Factura B 00003-00000041",
      }),
    ).toBeInTheDocument();
    // La 81 está anulada y su factura nunca se autorizó: ni enlace ni botón de facturar.
    expect(within(screen.getByTestId("venta-81")).queryByRole("link")).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId("venta-81")).queryByRole("button", { name: /Facturar|Reintentar/ }),
    ).not.toBeInTheDocument();
  });
  it("muestra el pago mixto con su detalle y el descuento; al anular avisa de la parte en efectivo", async () => {
    responder("v_turnos", "select", { data: turnoDePrueba() });
    responder("ventas", "select", {
      data: [
        ventaDePrueba({
          id: 83,
          precio: 27000,
          precio_lista: 30000,
          monto_descuento: 3000,
          descuento_nombre: "Jubilados",
          medio_pago: null,
          venta_pagos: [
            { medio: "efectivo", monto: 5000 },
            { medio: "tarjeta", monto: 22000 },
          ],
        }),
        ventaDePrueba({ id: 82, medio_pago: "tarjeta", precio: 20000 }),
      ],
    });
    renderRuta("/admin/ventas/turnos/5", admin());

    const mixta = await screen.findByTestId("venta-83");
    expect(normal(mixta.textContent)).toContain("MixtoEfectivo $ 5.000,00 + Tarjeta $ 22.000,00");
    expect(normal(mixta.textContent)).toContain("Jubilados−$ 3.000,00 · lista $ 30.000,00");
    expect(normal(mixta.textContent)).toContain("$ 27.000,00");
    const simple = screen.getByTestId("venta-82");
    expect(normal(simple.textContent)).toContain("Tarjeta");
    expect(normal(simple.textContent)).not.toContain("Mixto");
    expect(normal(simple.textContent)).not.toContain("lista");

    await userEvent.click(within(mixta).getByRole("button", { name: "Anular venta N° 83" }));
    const dialogo = screen.getByRole("dialog", { name: "Anular venta N° 83" });
    expect(normal(dialogo.textContent)).toContain(
      "Fue un pago mixto (Efectivo $ 5.000,00 + Tarjeta $ 22.000,00): la parte en efectivo ($ 5.000,00) sale de la caja del turno si sigue abierto, o de la caja de cambio.",
    );
  });
});
