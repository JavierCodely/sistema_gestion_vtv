import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FormularioVenta } from "@/modulos/caja/componentes/FormularioVenta";
import type { Categoria, Servicio } from "@/modulos/servicios/api/consultas";
import { renderConQuery } from "@tests/soporte/render";
import {
  argumentosRpc,
  reiniciarSupabaseFalso,
  responder,
  responderRpc,
} from "@tests/soporte/supabase-falso";

vi.mock("@/compartido/lib/supabase", async () => ({
  supabase: (await import("@tests/soporte/supabase-falso")).supabaseFalso,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }));

const CATEGORIAS: Categoria[] = [
  { id: 1, nombre: "Autos", activa: true },
  { id: 2, nombre: "Vieja", activa: false },
];
const servicio = (cambios: Partial<Servicio>): Servicio => ({
  id: 1,
  nombre: "VTV auto",
  categoria_id: 1,
  precio: 30000,
  requiere_certificado: true,
  activo: true,
  ...cambios,
});
const SERVICIOS: Servicio[] = [
  servicio({}),
  servicio({ id: 2, nombre: "Reverificación", requiere_certificado: false, precio: 10000 }),
  servicio({ id: 3, nombre: "Desactivado", activo: false }),
  servicio({ id: 4, nombre: "De categoría vieja", categoria_id: 2 }),
];

/** formatearMoneda separa "$" con un espacio duro: se compara con espacios normales. */
const sinEspaciosDuros = (texto: string | null | undefined) => (texto ?? "").replace(/\s/g, " ");

function ultimoAviso(fn: typeof toast.success) {
  const mensaje = vi.mocked(fn).mock.calls.at(-1)?.[0];
  return typeof mensaje === "string" ? sinEspaciosDuros(mensaje) : "";
}

function renderFormulario() {
  renderConQuery(<FormularioVenta categorias={CATEGORIAS} servicios={SERVICIOS} />);
}

async function elegirServicio(nombre: RegExp) {
  await userEvent.click(screen.getByLabelText("Servicio"));
  await userEvent.click(await screen.findByRole("option", { name: nombre }));
}

beforeEach(() => {
  reiniciarSupabaseFalso();
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.warning).mockClear();
});

describe("FormularioVenta", () => {
  it("solo ofrece servicios activos de categorías activas, con su precio", async () => {
    renderFormulario();
    await userEvent.click(screen.getByLabelText("Servicio"));
    const opciones = within(await screen.findByRole("listbox")).getAllByRole("option");
    expect(opciones.map((o) => sinEspaciosDuros(o.textContent))).toEqual([
      "VTV auto · $ 30.000,00",
      "Reverificación · $ 10.000,00",
    ]);
  });

  it("muestra qué hoja de certificado se va a usar", async () => {
    responderRpc("certificado_para_servicio", { data: 7 });
    responder("certificados", "select", { data: { id: 7, nombre: "Hoja VTV", stock_hojas: 1250 } });
    renderFormulario();
    await elegirServicio(/^VTV auto/);
    expect(await screen.findByTestId("aviso-certificado")).toHaveTextContent(
      "Usa una hoja de “Hoja VTV” (quedan 1.250).",
    );
  });

  it("avisa que no hay certificado configurado (la venta se registra igual)", async () => {
    responderRpc("certificado_para_servicio", { data: null });
    renderFormulario();
    await elegirServicio(/^VTV auto/);
    expect(await screen.findByTestId("aviso-certificado")).toHaveTextContent(
      "No hay un certificado configurado para este servicio.",
    );
  });

  it("un servicio sin certificado no consulta stock", async () => {
    renderFormulario();
    await elegirServicio(/^Reverificación/);
    expect(screen.getByText("Este servicio no lleva certificado.")).toBeInTheDocument();
    expect(argumentosRpc("certificado_para_servicio")).toBeUndefined();
  });

  it("valida y registra la venta con la patente normalizada", async () => {
    responderRpc("certificado_para_servicio", { data: null });
    responderRpc("registrar_venta", {
      data: { id: 81, servicio_nombre: "VTV auto", precio: 30000, sin_stock: false },
    });
    renderFormulario();
    await userEvent.click(screen.getByRole("button", { name: "Registrar venta" }));
    expect(screen.getByText("Elegí un servicio.")).toBeInTheDocument();
    expect(screen.getByText("Elegí el medio de pago.")).toBeInTheDocument();
    const medios = screen.getByRole("radiogroup", { name: "Medio de pago" });
    expect(medios).toHaveAttribute("aria-invalid", "true");
    expect(medios).toHaveAccessibleDescription("Elegí el medio de pago.");

    await elegirServicio(/^VTV auto/);
    await userEvent.click(screen.getByRole("radio", { name: "Tarjeta" }));
    await userEvent.type(screen.getByLabelText("Patente (opcional)"), "ab 123 cd");
    await userEvent.click(screen.getByRole("button", { name: "Registrar venta" }));
    await vi.waitFor(() => {
      expect(ultimoAviso(toast.success)).toBe("Venta N° 81: VTV auto · $ 30.000,00");
    });
    expect(argumentosRpc("registrar_venta")).toEqual({
      p_servicio_id: 1,
      p_medio_pago: "tarjeta",
      p_patente: "AB123CD",
    });
    // El formulario queda listo para la próxima venta
    expect(screen.getByLabelText("Patente (opcional)")).toHaveValue("");
  });

  it("una venta sin hoja de certificado avisa con una advertencia", async () => {
    responderRpc("registrar_venta", {
      data: { id: 82, servicio_nombre: "Reverificación", precio: 10000, sin_stock: true },
    });
    renderFormulario();
    await elegirServicio(/^Reverificación/);
    await userEvent.click(screen.getByRole("radio", { name: "Efectivo" }));
    await userEvent.click(screen.getByRole("button", { name: "Registrar venta" }));
    await vi.waitFor(() => {
      expect(ultimoAviso(toast.warning)).toBe(
        "Venta N° 82: Reverificación · $ 10.000,00 (sin hoja de certificado)",
      );
    });
    expect(toast.success).not.toHaveBeenCalled();
    expect(argumentosRpc("registrar_venta")).toEqual({
      p_servicio_id: 2,
      p_medio_pago: "efectivo",
    });
  });

  it("muestra el rechazo de la BD", async () => {
    responderRpc("registrar_venta", {
      error: { code: "P0001", message: "Necesitás un turno abierto para vender" },
    });
    renderFormulario();
    await elegirServicio(/^Reverificación/);
    await userEvent.click(screen.getByRole("radio", { name: "Transferencia" }));
    await userEvent.click(screen.getByRole("button", { name: "Registrar venta" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Necesitás un turno abierto para vender",
    );
  });
});
