import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CertificadoConStock } from "@/modulos/certificados/api/consultas";
import { TablaStock } from "@/modulos/certificados/componentes/TablaStock";
import { renderConQuery } from "@tests/soporte/render";
import { argumentosDe, reiniciarSupabaseFalso, responder } from "@tests/soporte/supabase-falso";
import { certificadoDePrueba } from "./datos";

vi.mock("@/compartido/lib/supabase", async () => ({
  supabase: (await import("@tests/soporte/supabase-falso")).supabaseFalso,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderTabla(certificados: CertificadoConStock[]) {
  const onAccion = vi.fn();
  const router = createMemoryRouter(
    [{ path: "/", element: <TablaStock certificados={certificados} onAccion={onAccion} /> }],
    { initialEntries: ["/"] },
  );
  renderConQuery(<RouterProvider router={router} />);
  return onAccion;
}

beforeEach(() => {
  reiniciarSupabaseFalso();
  vi.mocked(toast.error).mockClear();
  vi.mocked(toast.success).mockClear();
});

describe("TablaStock", () => {
  it("muestra stock, estado, valor y el enlace a movimientos", () => {
    renderTabla([
      certificadoDePrueba({
        stock_hojas: 1250,
        semaforo: "ok",
        costo_promedio: 2000,
        valor_stock: 2500000,
      }),
    ]);
    const fila = screen.getByTestId("certificado-Hoja VTV");
    expect(fila).toHaveTextContent("1.250");
    expect(fila).toHaveTextContent("OK");
    expect(fila).toHaveTextContent("2.000,00");
    expect(fila).toHaveTextContent("2.500.000,00");
    expect(screen.getByRole("link", { name: "Movimientos de Hoja VTV" })).toHaveAttribute(
      "href",
      "/4",
    );
  });

  it("marca el certificado de condicional con su plazo", () => {
    renderTabla([
      certificadoDePrueba({ nombre: "Hoja B", condicional: true, dias_vuelta: 30 }),
      certificadoDePrueba({ id: 5, nombre: "Hoja E" }),
    ]);
    expect(screen.getByTestId("certificado-Hoja B")).toHaveTextContent(
      "Condicional · vuelve dentro de 30 días",
    );
    expect(screen.getByTestId("certificado-Hoja E")).not.toHaveTextContent("Condicional");
  });

  it("los botones avisan la acción con el certificado", async () => {
    const onAccion = renderTabla([certificadoDePrueba()]);
    await userEvent.click(screen.getByRole("button", { name: "Ajuste de stock de Hoja VTV" }));
    expect(onAccion).toHaveBeenCalledWith("ajustar", expect.objectContaining({ id: 4 }));
    await userEvent.click(screen.getByRole("button", { name: "Registrar compra de Hoja VTV" }));
    expect(onAccion).toHaveBeenCalledWith("comprar", expect.objectContaining({ id: 4 }));
  });

  it("'Se usa en' muestra los destinos y avisa si no se usa en ninguna venta", async () => {
    const onAccion = renderTabla([
      certificadoDePrueba({
        todos_servicios: false,
        categoria_ids: [1],
        servicio_ids: [7],
        aplica_a: "Categoría Autos, Moto",
      }),
      certificadoDePrueba({
        id: 5,
        nombre: "Hoja nueva",
        todos_servicios: false,
        aplica_a: "Sin asignar",
      }),
    ]);
    const destinos = (nombre: string) =>
      screen.getByTestId(`certificado-${nombre}`).querySelector('[data-columna="destinos"]');
    expect(destinos("Hoja VTV")).toHaveTextContent("Categoría Autos, Moto");
    expect(destinos("Hoja VTV")).not.toHaveTextContent("No se usa en ninguna venta");
    expect(destinos("Hoja nueva")).toHaveTextContent(
      "Sin asignarNo se usa en ninguna venta: elegí dónde con “Se usa en”.",
    );
    await userEvent.click(screen.getByRole("button", { name: "Dónde se usa Hoja nueva" }));
    expect(onAccion).toHaveBeenCalledWith("destinos", expect.objectContaining({ id: 5 }));
  });

  it("'Se usa en' con muchos destinos no ensancha la tabla: corta el texto y lo muestra entero al pasar el mouse", () => {
    const largo = `Categoría Autos, ${Array.from({ length: 40 }, (_, i) => `Servicio ${i + 1}`).join(", ")}`;
    renderTabla([
      certificadoDePrueba({ todos_servicios: false, servicio_ids: [7], aplica_a: largo }),
    ]);
    const texto = screen.getByTitle(largo);
    expect(texto).toHaveTextContent(largo);
    expect(texto).toHaveClass("max-w-64", "truncate");
  });

  it("un certificado desactivado no permite registrar compras", () => {
    renderTabla([certificadoDePrueba({ activo: false })]);
    expect(screen.getByRole("button", { name: "Registrar compra de Hoja VTV" })).toBeDisabled();
    expect(screen.getByText("Desactivado: activalo para registrar compras.")).toBeInTheDocument();
  });

  it("al activar, explica el choque con otro certificado activo del mismo destino", async () => {
    responder("certificados", "update", {
      error: {
        code: "23505",
        message: 'duplicate key value violates unique constraint "certificados_uno_por_servicio"',
      },
    });
    renderTabla([
      certificadoDePrueba({ activo: false, todos_servicios: false, servicio_ids: [5] }),
    ]);
    await userEvent.click(screen.getByRole("switch", { name: "Certificado Hoja VTV activo" }));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "Uno de los servicios ya tiene otro certificado activo del mismo tipo. Desactivalo antes de activar este.",
      );
    });
    expect(argumentosDe("certificados", "update")).toEqual([{ activo: true }]);
    expect(toast.success).not.toHaveBeenCalled();
  });
});
