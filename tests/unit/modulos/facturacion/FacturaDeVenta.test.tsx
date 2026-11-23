import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderConQuery } from "@tests/soporte/render";
import {
  argumentosRpc,
  llamadas,
  reiniciarSupabaseFalso,
  responder,
  responderRpc,
} from "@tests/soporte/supabase-falso";
import type { Comprobante } from "@/modulos/facturacion/api/consultas";
import { comprobanteDePrueba, CONDICIONES } from "./datos";

vi.mock("@/compartido/lib/supabase", async () => ({
  supabase: (await import("@tests/soporte/supabase-falso")).supabaseFalso,
}));
const invocarFuncion = vi.fn();
vi.mock("@/compartido/lib/funciones", () => ({ invocarFuncion }));
const { FacturaDeVenta } = await import("@/modulos/facturacion/componentes/FacturaDeVenta");
const { DialogoFacturar } = await import("@/modulos/facturacion/componentes/DialogoFacturar");

const venta = { id: 82, servicio_nombre: "VTV auto", precio: 20000 };

function mostrar(comprobantes: Comprobante[] = [], anulada = false) {
  return renderConQuery(
    <MemoryRouter>
      <FacturaDeVenta venta={venta} anulada={anulada} comprobantes={comprobantes} />
    </MemoryRouter>,
  );
}

async function abrirDialogo(nombre = "Facturar venta N° 82") {
  await userEvent.click(screen.getByRole("button", { name: nombre }));
  return screen.findByRole("dialog", { name: "Facturar venta N° 82" });
}

beforeEach(() => {
  reiniciarSupabaseFalso();
  invocarFuncion.mockReset();
  responder("arca_condiciones_iva", "select", { data: CONDICIONES });
});

describe("FacturaDeVenta", () => {
  it("con factura autorizada muestra el enlace al comprobante", () => {
    mostrar([comprobanteDePrueba()]);
    expect(screen.getByRole("link", { name: "Ver Factura B 00003-00000041" })).toHaveAttribute(
      "href",
      "/comprobantes/10",
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("una venta anulada sin factura no se puede facturar", () => {
    mostrar([], true);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("factura a consumidor final por defecto: prepara en la BD y emite en ARCA", async () => {
    responderRpc("preparar_factura", { data: { id: 10 } });
    invocarFuncion.mockResolvedValue({ comprobante: comprobanteDePrueba() });
    mostrar();
    const dialogo = await abrirDialogo();
    expect(await within(dialogo).findByTestId("clase-factura")).toHaveTextContent(
      "Se emite Factura B.",
    );
    expect(within(dialogo).getByRole("radio", { name: "Sin identificar" })).toBeChecked();
    await userEvent.click(within(dialogo).getByRole("button", { name: "Emitir factura" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(argumentosRpc("preparar_factura")).toEqual({
      p_venta_id: 82,
      p_condicion_iva_id: 5,
      p_doc_tipo: 99,
      p_doc_nro: 0,
    });
    expect(invocarFuncion).toHaveBeenCalledWith("arca", { accion: "emitir", comprobante_id: 10 });
  });

  it("responsable inscripto: Factura A con CUIT válido y razón social", async () => {
    responderRpc("preparar_factura", { data: { id: 11 } });
    invocarFuncion.mockResolvedValue({
      comprobante: comprobanteDePrueba({ id: 11, clase: "A", cbte_tipo: 1 }),
    });
    mostrar();
    const dialogo = await abrirDialogo();
    await userEvent.click(await within(dialogo).findByRole("combobox"));
    await userEvent.click(await screen.findByRole("option", { name: "IVA Responsable Inscripto" }));
    expect(within(dialogo).getByTestId("clase-factura")).toHaveTextContent(
      "Se emite Factura A (requiere CUIT).",
    );
    expect(within(dialogo).getByRole("radio", { name: "CUIT" })).toBeChecked();
    expect(within(dialogo).getByRole("radio", { name: "DNI" })).toBeDisabled();

    await userEvent.type(within(dialogo).getByLabelText("Número de CUIT"), "30-71234567-2");
    await userEvent.click(within(dialogo).getByRole("button", { name: "Emitir factura" }));
    expect(within(dialogo).getByText("El CUIT no es válido.")).toBeInTheDocument();
    expect(within(dialogo).getByText("Ingresá el nombre o la razón social.")).toBeInTheDocument();
    expect(argumentosRpc("preparar_factura")).toBeUndefined();

    await userEvent.clear(within(dialogo).getByLabelText("Número de CUIT"));
    await userEvent.type(within(dialogo).getByLabelText("Número de CUIT"), "30-71234567-1");
    await userEvent.type(within(dialogo).getByLabelText("Nombre o razón social"), "Empresa SA");
    await userEvent.click(within(dialogo).getByRole("button", { name: "Emitir factura" }));
    await waitFor(() => {
      expect(argumentosRpc("preparar_factura")).toEqual({
        p_venta_id: 82,
        p_condicion_iva_id: 1,
        p_doc_tipo: 80,
        p_doc_nro: 30712345671,
        p_receptor_nombre: "Empresa SA",
      });
    });
  });

  it("si ARCA rechaza, el diálogo queda abierto con el motivo para corregir y reintentar", async () => {
    responderRpc("preparar_factura", { data: { id: 10 } });
    invocarFuncion.mockResolvedValue({
      comprobante: comprobanteDePrueba({
        estado: "rechazado",
        numero: null,
        cae: null,
        mensaje: "10013: el documento no es válido",
      }),
    });
    mostrar();
    const dialogo = await abrirDialogo();
    await within(dialogo).findByTestId("clase-factura");
    await userEvent.click(within(dialogo).getByRole("button", { name: "Emitir factura" }));
    expect(await within(dialogo).findByText("ARCA rechazó la factura")).toBeInTheDocument();
    expect(within(dialogo).getByText("10013: el documento no es válido")).toBeInTheDocument();
    expect(within(dialogo).getByRole("button", { name: "Reintentar factura" })).toBeEnabled();
  });

  it("muestra el error de la BD (ej. turno cerrado) sin llamar a ARCA", async () => {
    responderRpc("preparar_factura", {
      error: { code: "P0001", message: "Solo podés facturar las ventas de tu turno abierto" },
    });
    mostrar();
    const dialogo = await abrirDialogo();
    await within(dialogo).findByTestId("clase-factura");
    await userEvent.click(within(dialogo).getByRole("button", { name: "Emitir factura" }));
    expect(
      await within(dialogo).findByText("Solo podés facturar las ventas de tu turno abierto"),
    ).toBeInTheDocument();
    expect(invocarFuncion).not.toHaveBeenCalled();
  });

  it("a confirmar con ARCA: no deja cambiar datos, solo reintenta la emisión", async () => {
    const pendiente = comprobanteDePrueba({
      estado: "pendiente",
      numero: null,
      cae: null,
      a_reconciliar: true,
      mensaje: "ARCA no respondió",
      doc_tipo: 96,
      doc_nro: 30111222,
      receptor_nombre: "Juan",
    });
    invocarFuncion.mockResolvedValue({ comprobante: comprobanteDePrueba() });
    mostrar([pendiente]);
    expect(screen.getByText("Factura pendiente")).toBeInTheDocument();
    const dialogo = await abrirDialogo("Reintentar factura venta N° 82");
    expect(await within(dialogo).findByText("Falta confirmar con ARCA")).toBeInTheDocument();
    expect(within(dialogo).getByLabelText("Número de DNI")).toBeDisabled();
    expect(within(dialogo).getByLabelText("Número de DNI")).toHaveValue("30111222");
    await userEvent.click(within(dialogo).getByRole("button", { name: "Reintentar con ARCA" }));
    await waitFor(() => {
      expect(invocarFuncion).toHaveBeenCalledWith("arca", { accion: "emitir", comprobante_id: 10 });
    });
    expect(argumentosRpc("preparar_factura")).toBeUndefined();
  });

  it("sin condiciones de ARCA cargadas avisa que hay que probar la conexión", async () => {
    responder("arca_condiciones_iva", "select", { data: [] });
    mostrar();
    const dialogo = await abrirDialogo();
    expect(
      await within(dialogo).findByText(/Todavía no se cargaron las condiciones/),
    ).toBeInTheDocument();
  });

  it("si la emisión falla después de preparar, el reintento solo vuelve a emitir", async () => {
    responderRpc("preparar_factura", { data: { id: 10 } });
    invocarFuncion.mockRejectedValueOnce(new Error("No se pudo completar la operación."));
    const onCerrar = vi.fn();
    // Mismo QueryClient en los dos renders (rerender no repite el provider de renderConQuery).
    const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const conCliente = (comprobante?: Comprobante) => (
      <QueryClientProvider client={cliente}>
        <DialogoFacturar venta={venta} comprobante={comprobante} onCerrar={onCerrar} />
      </QueryClientProvider>
    );
    const { rerender } = render(conCliente());
    const dialogo = await screen.findByRole("dialog", { name: "Facturar venta N° 82" });
    await within(dialogo).findByTestId("clase-factura");
    await userEvent.click(within(dialogo).getByRole("button", { name: "Emitir factura" }));
    expect(
      await within(dialogo).findByText("No se pudo completar la operación."),
    ).toBeInTheDocument();

    // La lista se refrescó: el comprobante quedó a confirmar con ARCA.
    rerender(
      conCliente(
        comprobanteDePrueba({
          estado: "pendiente",
          numero: null,
          cae: null,
          a_reconciliar: true,
          mensaje: "ARCA no respondió",
        }),
      ),
    );
    expect(await within(dialogo).findByText("Falta confirmar con ARCA")).toBeInTheDocument();
    invocarFuncion.mockResolvedValueOnce({ comprobante: comprobanteDePrueba() });
    await userEvent.click(within(dialogo).getByRole("button", { name: "Reintentar con ARCA" }));
    await waitFor(() => {
      expect(onCerrar).toHaveBeenCalled();
    });
    expect(invocarFuncion).toHaveBeenLastCalledWith("arca", {
      accion: "emitir",
      comprobante_id: 10,
    });
    // preparar_factura se llamó una sola vez (el primer intento)
    expect(llamadas.filter((l) => l.tabla === "rpc:preparar_factura")).toHaveLength(1);
  });

  it("al cambiar de condición ajusta el documento: CF sin identificar → exento pide DNI", async () => {
    mostrar();
    const dialogo = await abrirDialogo();
    await within(dialogo).findByTestId("clase-factura");
    expect(within(dialogo).getByRole("radio", { name: "Sin identificar" })).toBeChecked();
    await userEvent.click(within(dialogo).getByRole("combobox"));
    await userEvent.click(await screen.findByRole("option", { name: "IVA Sujeto Exento" }));
    expect(within(dialogo).getByRole("radio", { name: "DNI" })).toBeChecked();
    expect(within(dialogo).getByRole("radio", { name: "Sin identificar" })).toBeDisabled();
    expect(within(dialogo).getByTestId("clase-factura")).toHaveTextContent("Se emite Factura B.");
  });

  it("NC pendiente: el admin la reintenta; el cajero solo ve el estado", async () => {
    const factura = comprobanteDePrueba();
    const nc = comprobanteDePrueba({
      id: 12,
      tipo: "nota_credito",
      cbte_tipo: 8,
      estado: "rechazado",
      numero: null,
      cae: null,
      mensaje: "10197: comprobante asociado",
    });
    const { unmount } = mostrar([factura, nc], true);
    expect(screen.getByText("Nota de crédito rechazada")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    unmount();

    invocarFuncion.mockResolvedValue({
      comprobante: comprobanteDePrueba({ id: 12, tipo: "nota_credito", cbte_tipo: 8, numero: 1 }),
    });
    renderConQuery(
      <MemoryRouter>
        <FacturaDeVenta venta={venta} anulada comprobantes={[factura, nc]} puedeEmitirNotas />
      </MemoryRouter>,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Emitir nota de crédito de la venta N° 82" }),
    );
    await waitFor(() => {
      expect(invocarFuncion).toHaveBeenCalledWith("arca", { accion: "emitir", comprobante_id: 12 });
    });
  });
});
