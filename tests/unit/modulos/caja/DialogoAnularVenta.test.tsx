import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DialogoAnularVenta } from "@/modulos/caja/componentes/DialogoAnularVenta";
import { renderConQuery } from "@tests/soporte/render";
import {
  argumentosDe,
  argumentosRpc,
  reiniciarSupabaseFalso,
  responder,
  responderRpc,
} from "@tests/soporte/supabase-falso";
import { ventaDePrueba } from "../ventas/datos";

vi.mock("@/compartido/lib/supabase", async () => ({
  supabase: (await import("@tests/soporte/supabase-falso")).supabaseFalso,
}));
const { invocarFuncion } = vi.hoisted(() => ({ invocarFuncion: vi.fn() }));
vi.mock("@/compartido/lib/funciones", () => ({ invocarFuncion }));

const venta = ventaDePrueba;

beforeEach(() => {
  reiniciarSupabaseFalso();
  invocarFuncion.mockReset();
  // Sin factura: no hay nota de crédito que emitir.
  responder("comprobantes", "select", { data: null });
});

describe("DialogoAnularVenta", () => {
  it("avisa de dónde sale el efectivo solo si fue en efectivo", () => {
    const { unmount } = renderConQuery(<DialogoAnularVenta venta={venta()} onCerrar={vi.fn()} />);
    expect(
      screen.getByText(
        /el monto sale de la caja del turno si sigue abierto, o de la caja de cambio/,
      ),
    ).toBeInTheDocument();
    unmount();
    renderConQuery(
      <DialogoAnularVenta venta={venta({ medio_pago: "tarjeta" })} onCerrar={vi.fn()} />,
    );
    expect(screen.queryByText(/el monto sale de la caja/)).not.toBeInTheDocument();
  });

  it("exige el motivo y anula con la RPC", async () => {
    responderRpc("anular_venta", { data: { id: 81, anulada: true } });
    const onCerrar = vi.fn();
    renderConQuery(<DialogoAnularVenta venta={venta()} onCerrar={onCerrar} />);
    await userEvent.click(screen.getByRole("button", { name: "Anular venta" }));
    expect(screen.getByText("Escribí el motivo.")).toBeInTheDocument();
    expect(argumentosRpc("anular_venta")).toBeUndefined();

    await userEvent.type(screen.getByLabelText("Motivo"), " Servicio equivocado ");
    await userEvent.click(screen.getByRole("button", { name: "Anular venta" }));
    await waitFor(() => {
      expect(onCerrar).toHaveBeenCalled();
    });
    expect(argumentosRpc("anular_venta")).toEqual({
      p_venta_id: 81,
      p_motivo: "Servicio equivocado",
    });
  });

  it("muestra el rechazo de la BD (ej. no alcanza el efectivo)", async () => {
    responderRpc("anular_venta", {
      error: { code: "P0001", message: "No hay suficiente efectivo en la caja de cambio" },
    });
    renderConQuery(<DialogoAnularVenta venta={venta()} onCerrar={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Motivo"), "Error");
    await userEvent.click(screen.getByRole("button", { name: "Anular venta" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No hay suficiente efectivo en la caja de cambio",
    );
  });

  it("si la venta estaba facturada emite enseguida la nota de crédito que dejó la BD", async () => {
    responderRpc("anular_venta", { data: { id: 81, anulada: true } });
    responder("comprobantes", "select", { data: { id: 33, estado: "pendiente" } });
    invocarFuncion.mockResolvedValue({
      comprobante: {
        id: 33,
        venta_id: 81,
        turno_id: 5,
        tipo: "nota_credito",
        clase: "B",
        cbte_tipo: 8,
        ambiente: "homologacion",
        cuit_emisor: "30712345671",
        punto_venta: 3,
        numero: 2,
        estado: "autorizado",
        fecha: "2026-11-20",
        fecha_servicio: "2026-11-20",
        doc_tipo: 99,
        doc_nro: 0,
        receptor_nombre: null,
        condicion_iva_receptor: "Consumidor Final",
        neto: 24793.39,
        iva: 5206.61,
        total: 30000,
        cae: "76123456789013",
        cae_vencimiento: "2026-11-30",
        mensaje: null,
        intentos: 1,
        a_reconciliar: false,
        creado_en: "2026-11-20T13:00:00Z",
        servicio_nombre: "VTV auto",
        patente: null,
        asociado_cbte_tipo: 6,
        asociado_punto_venta: 3,
        asociado_numero: 41,
        asociado_fecha: "2026-11-20",
        qr_url: null,
      },
    });
    const onCerrar = vi.fn();
    renderConQuery(<DialogoAnularVenta venta={venta()} onCerrar={onCerrar} />);
    await userEvent.type(screen.getByLabelText("Motivo"), "Cobro duplicado");
    await userEvent.click(screen.getByRole("button", { name: "Anular venta" }));
    await waitFor(() => {
      expect(invocarFuncion).toHaveBeenCalledWith("arca", { accion: "emitir", comprobante_id: 33 });
    });
    expect(argumentosDe("comprobantes", "select", "eq")).toEqual(["venta_id", 81]);
    expect(onCerrar).toHaveBeenCalled();
  });

  it("anulada por el cajero: no emite la nota de crédito (queda pendiente para el admin)", async () => {
    responderRpc("anular_venta", { data: { id: 81, anulada: true } });
    const onCerrar = vi.fn();
    renderConQuery(
      <DialogoAnularVenta
        venta={venta()}
        onCerrar={onCerrar}
        emitirNotaDeCredito={false}
        facturada
      />,
    );
    expect(
      screen.getByText(
        /Está facturada: la nota de crédito queda pendiente y la emite el administrador/,
      ),
    ).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Motivo"), "Cobro duplicado");
    await userEvent.click(screen.getByRole("button", { name: "Anular venta" }));
    await waitFor(() => {
      expect(onCerrar).toHaveBeenCalled();
    });
    expect(argumentosDe("comprobantes", "select")).toBeUndefined();
    expect(invocarFuncion).not.toHaveBeenCalled();
  });

  it("sin factura autorizada no llama a ARCA", async () => {
    responderRpc("anular_venta", { data: { id: 81, anulada: true } });
    const onCerrar = vi.fn();
    renderConQuery(<DialogoAnularVenta venta={venta()} onCerrar={onCerrar} />);
    await userEvent.type(screen.getByLabelText("Motivo"), "Cobro duplicado");
    await userEvent.click(screen.getByRole("button", { name: "Anular venta" }));
    await waitFor(() => {
      expect(onCerrar).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(argumentosDe("comprobantes", "select")).toBeDefined();
    });
    expect(invocarFuncion).not.toHaveBeenCalled();
  });
});
