import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Venta } from "@/modulos/caja/api/consultas";
import { DialogoAnularVenta } from "@/modulos/ventas/componentes/DialogoAnularVenta";
import { renderConQuery } from "@tests/soporte/render";
import { argumentosRpc, reiniciarSupabaseFalso, responderRpc } from "@tests/soporte/supabase-falso";

vi.mock("@/compartido/lib/supabase", async () => ({
  supabase: (await import("@tests/soporte/supabase-falso")).supabaseFalso,
}));

const venta = (cambios: Partial<Venta> = {}): Venta => ({
  id: 81,
  creado_en: "2026-11-20T12:30:00Z",
  turno_id: 5,
  servicio_nombre: "VTV auto",
  precio: 30000,
  medio_pago: "efectivo",
  patente: null,
  sin_stock: false,
  anulada: false,
  anulada_motivo: null,
  anulada_en: null,
  ...cambios,
});

beforeEach(() => {
  reiniciarSupabaseFalso();
});

describe("DialogoAnularVenta", () => {
  it("avisa que el efectivo sale de la caja de cambio solo si fue en efectivo", () => {
    const { unmount } = renderConQuery(<DialogoAnularVenta venta={venta()} onCerrar={vi.fn()} />);
    expect(screen.getByText(/el monto sale de la caja de cambio/)).toBeInTheDocument();
    unmount();
    renderConQuery(
      <DialogoAnularVenta venta={venta({ medio_pago: "tarjeta" })} onCerrar={vi.fn()} />,
    );
    expect(screen.queryByText(/el monto sale de la caja de cambio/)).not.toBeInTheDocument();
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
    await vi.waitFor(() => {
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
});
