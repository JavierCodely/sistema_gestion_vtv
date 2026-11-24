import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DialogoCompra } from "@/modulos/certificados/componentes/DialogoCompra";
import { renderConQuery } from "@tests/soporte/render";
import {
  argumentosRpc,
  reiniciarSupabaseFalso,
  responder,
  responderRpc,
} from "@tests/soporte/supabase-falso";
import { certificadoDePrueba, compraDePrueba } from "./datos";

vi.mock("@/compartido/lib/supabase", async () => ({
  supabase: (await import("@tests/soporte/supabase-falso")).supabaseFalso,
}));

const CERTIFICADO = certificadoDePrueba();

async function elegirFuente(texto: string) {
  await userEvent.click(screen.getByLabelText("Se pagó con"));
  await userEvent.click(await screen.findByRole("option", { name: texto }));
}

beforeEach(() => {
  reiniciarSupabaseFalso();
  responder("caja_efectivo", "select", { data: { saldo: 12500 } });
});

describe("DialogoCompra", () => {
  it("informa cuántas hojas entran y el saldo si se paga en efectivo", async () => {
    renderConQuery(<DialogoCompra certificado={CERTIFICADO} onCerrar={vi.fn()} />);
    expect(screen.getByLabelText("Cantidad de cajas")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Cantidad de cajas"), "4");
    expect(screen.getByTestId("hojas-que-entran")).toHaveTextContent("Entran 100 hojas al stock.");
    await elegirFuente("Efectivo (caja de cambio)");
    expect(await screen.findByText(/Saldo de la caja de cambio:/)).toHaveTextContent("12.500,00");
  });

  it("valida antes de llamar a la BD", async () => {
    renderConQuery(<DialogoCompra certificado={CERTIFICADO} onCerrar={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Registrar compra" }));
    expect(screen.getByText("Ingresá la cantidad de cajas.")).toBeInTheDocument();
    expect(screen.getByText("Ingresá un costo.")).toBeInTheDocument();
    expect(screen.getByText("Elegí con qué se pagó.")).toBeInTheDocument();
    expect(argumentosRpc("registrar_compra_certificado")).toBeUndefined();
  });

  it("registra la compra con los argumentos de la RPC y cierra", async () => {
    responderRpc("registrar_compra_certificado", { data: { hojas: 50, costo_total: 100000 } });
    const onCerrar = vi.fn();
    renderConQuery(<DialogoCompra certificado={CERTIFICADO} onCerrar={onCerrar} />);
    await userEvent.type(screen.getByLabelText("Cantidad de cajas"), "2");
    await userEvent.type(screen.getByLabelText("Costo por caja ($)"), "50.000");
    await elegirFuente("Transferencia");
    await userEvent.type(screen.getByLabelText("Proveedor (opcional)"), "Imprenta Sur");
    await userEvent.click(screen.getByRole("button", { name: "Registrar compra" }));
    await waitFor(() => {
      expect(onCerrar).toHaveBeenCalled();
    });
    expect(argumentosRpc("registrar_compra_certificado")).toEqual({
      p_certificado_id: 4,
      p_unidades: 2,
      p_costo_unidad: 50000,
      p_fuente: "transferencia",
      p_proveedor: "Imprenta Sur",
    });
  });

  it("muestra el rechazo de la BD (ej. sin efectivo) y no cierra", async () => {
    responderRpc("registrar_compra_certificado", {
      error: {
        code: "P0001",
        message:
          "No hay suficiente efectivo en la caja de cambio (disponible: $0.00, necesario: $1.00)",
      },
    });
    const onCerrar = vi.fn();
    renderConQuery(<DialogoCompra certificado={CERTIFICADO} onCerrar={onCerrar} />);
    await userEvent.type(screen.getByLabelText("Cantidad de cajas"), "1");
    await userEvent.type(screen.getByLabelText("Costo por caja ($)"), "1");
    await elegirFuente("Efectivo (caja de cambio)");
    await userEvent.click(screen.getByRole("button", { name: "Registrar compra" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/No hay suficiente efectivo/);
    expect(onCerrar).not.toHaveBeenCalled();
  });
});

describe("DialogoCompra en modo edición", () => {
  it("precarga la compra original y avisa que el efectivo se devuelve antes", async () => {
    renderConQuery(<DialogoCompra original={compraDePrueba()} onCerrar={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Editar compra #12" })).toBeInTheDocument();
    expect(screen.getByLabelText("Cantidad de cajas")).toHaveValue("2");
    expect(screen.getByLabelText("Costo por caja ($)")).toHaveValue("50000");
    expect(screen.getByLabelText("Proveedor (opcional)")).toHaveValue("Imprenta Sur");
    expect(screen.getByLabelText("Se pagó con")).toHaveTextContent("Efectivo (caja de cambio)");
    expect(await screen.findByText(/Saldo de la caja de cambio:/)).toHaveTextContent(
      "antes se devuelven $ 100.000,00 de la compra original",
    );
  });

  it("exige el motivo y no llama a la BD sin él", async () => {
    renderConQuery(<DialogoCompra original={compraDePrueba()} onCerrar={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Guardar corrección" }));
    expect(screen.getByText("Escribí el motivo de la corrección.")).toBeInTheDocument();
    expect(argumentosRpc("corregir_compra_certificado")).toBeUndefined();
  });

  it("manda la corrección con el motivo y cierra", async () => {
    responderRpc("corregir_compra_certificado", { data: { hojas: 75, costo_total: 120000 } });
    const onCerrar = vi.fn();
    renderConQuery(<DialogoCompra original={compraDePrueba()} onCerrar={onCerrar} />);
    await userEvent.clear(screen.getByLabelText("Cantidad de cajas"));
    await userEvent.type(screen.getByLabelText("Cantidad de cajas"), "3");
    expect(screen.getByTestId("hojas-que-entran")).toHaveTextContent("Entran 75 hojas al stock.");
    await userEvent.clear(screen.getByLabelText("Costo por caja ($)"));
    await userEvent.type(screen.getByLabelText("Costo por caja ($)"), "40.000");
    await elegirFuente("Transferencia");
    await userEvent.clear(screen.getByLabelText("Proveedor (opcional)"));
    await userEvent.type(screen.getByLabelText("Motivo de la corrección"), " Era otra cantidad ");
    await userEvent.click(screen.getByRole("button", { name: "Guardar corrección" }));
    await waitFor(() => {
      expect(onCerrar).toHaveBeenCalled();
    });
    expect(argumentosRpc("corregir_compra_certificado")).toEqual({
      p_compra_id: 12,
      p_unidades: 3,
      p_costo_unidad: 40000,
      p_fuente: "transferencia",
      p_proveedor: "",
      p_motivo: "Era otra cantidad",
    });
    expect(argumentosRpc("registrar_compra_certificado")).toBeUndefined();
  });

  it("muestra el rechazo de la BD (ya no es la última compra)", async () => {
    responderRpc("corregir_compra_certificado", {
      error: {
        code: "P0001",
        message:
          "Solo se puede editar la última compra de un certificado, sin ventas ni ajustes posteriores. Corregí la diferencia con un ajuste de stock.",
      },
    });
    renderConQuery(<DialogoCompra original={compraDePrueba()} onCerrar={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Motivo de la corrección"), "Error");
    await userEvent.click(screen.getByRole("button", { name: "Guardar corrección" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Solo se puede editar la última compra de un certificado",
    );
  });

  it("una compra nueva propone el costo vigente del certificado", () => {
    renderConQuery(
      <DialogoCompra
        certificado={certificadoDePrueba({ unidad_compra: "libreta", costo_unidad: 3700 })}
        onCerrar={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Costo por libreta ($)")).toHaveValue("3700");
  });
});
