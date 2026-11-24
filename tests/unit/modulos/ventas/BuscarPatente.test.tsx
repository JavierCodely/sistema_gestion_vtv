import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VentaDePatente } from "@/modulos/ventas/api/consultas";
import { normalizarPatente } from "@/modulos/ventas/lib/patente";
import { BuscarPatente } from "@/modulos/ventas/paginas/BuscarPatente";
import { renderConQuery } from "@tests/soporte/render";
import { argumentosRpc, reiniciarSupabaseFalso, responderRpc } from "@tests/soporte/supabase-falso";

vi.mock("@/compartido/lib/supabase", async () => ({
  supabase: (await import("@tests/soporte/supabase-falso")).supabaseFalso,
}));

const normal = (texto: string | null | undefined) => (texto ?? "").replace(/\s/g, " ");

function venta(cambios: Partial<VentaDePatente> = {}): VentaDePatente {
  return {
    id: 10,
    creado_en: "2026-11-02T13:00:00Z",
    patente: "AB123CD",
    caja_nombre: "Caja 1",
    usuario_nombre: "Ana Pérez",
    servicio_nombre: "Auto condicional",
    categoria_nombre: "Autos",
    precio: 71000,
    medio: "efectivo",
    anulada: false,
    venta_pasada: false,
    certificado_nombre: "Hoja condicional",
    sin_stock: false,
    condicional_vence: "2026-12-02",
    condicional_saldo: null,
    condicional_servicio: "Auto",
    vuelta_de: null,
    vuelta_venta_id: 11,
    ...cambios,
  };
}

function renderPagina(ruta = "/patentes") {
  const router = createMemoryRouter([{ path: "/patentes", element: <BuscarPatente /> }], {
    initialEntries: [ruta],
  });
  renderConQuery(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => {
  reiniciarSupabaseFalso();
});

describe("BuscarPatente", () => {
  it("busca la patente normalizada y muestra cada venta con servicio, certificado y condicional", async () => {
    responderRpc("ventas_por_patente", {
      data: [
        venta({
          id: 11,
          servicio_nombre: "Auto",
          precio: 0,
          certificado_nombre: "Hoja aprobado",
          condicional_vence: null,
          condicional_saldo: null,
          condicional_servicio: null,
          vuelta_de: 10,
          vuelta_venta_id: null,
        }),
        venta(),
        venta({
          id: 9,
          servicio_nombre: "Reverificación",
          medio: "mixto",
          certificado_nombre: null,
          condicional_vence: null,
          condicional_saldo: null,
          condicional_servicio: null,
          vuelta_venta_id: null,
          anulada: true,
        }),
      ],
    });
    const router = renderPagina();
    await userEvent.type(screen.getByLabelText("Patente"), "ab 123-cd{Enter}");

    expect(await screen.findByTestId("cantidad-ventas-patente")).toHaveTextContent("3 ventas");
    expect(argumentosRpc("ventas_por_patente")).toEqual({ p_patente: "AB123CD" });
    expect(router.state.location.search).toBe("?patente=AB123CD");

    const vuelta = screen.getByTestId("venta-patente-11");
    expect(vuelta).toHaveTextContent("Hoja aprobado");
    expect(vuelta).toHaveTextContent("Vuelta sin cargo de la N° 10");
    expect(normal(vuelta.textContent)).toContain("$ 0,00");

    const condicional = screen.getByTestId("venta-patente-10");
    expect(condicional).toHaveTextContent("Auto condicional");
    expect(condicional).toHaveTextContent("Hoja condicional");
    expect(condicional).toHaveTextContent("Condicional hasta 02/12/2026");
    expect(condicional).toHaveTextContent("Volvió: venta N° 11");
    expect(condicional).toHaveTextContent("Caja 1");
    expect(condicional).toHaveTextContent("Ana Pérez");

    const anulada = screen.getByTestId("venta-patente-9");
    expect(within(anulada).getByText("Anulada")).toBeInTheDocument();
    expect(anulada).toHaveTextContent("No lleva");
    expect(anulada).toHaveTextContent("Mixto");
  });

  it("una condicional sin vuelta dice a qué servicio vuelve sin cargo", async () => {
    responderRpc("ventas_por_patente", { data: [venta({ vuelta_venta_id: null })] });
    renderPagina("/patentes?patente=AB123CD");
    expect(await screen.findByTestId("venta-patente-10")).toHaveTextContent(
      "Vuelve a “Auto” sin cargo",
    );
    expect(screen.getByLabelText("Patente")).toHaveValue("AB123CD");
  });

  it("una condicional al 50% dice cuánto falta; su vuelta, que pagó el resto", async () => {
    responderRpc("ventas_por_patente", {
      data: [
        venta({ id: 12, precio: 35500, condicional_saldo: 35500, vuelta_venta_id: 13 }),
        venta({
          id: 13,
          servicio_nombre: "Auto",
          precio: 35500,
          condicional_vence: null,
          condicional_saldo: null,
          condicional_servicio: null,
          vuelta_de: 12,
          vuelta_venta_id: null,
        }),
        venta({ id: 14, condicional_saldo: 35500, vuelta_venta_id: null }),
      ],
    });
    renderPagina("/patentes?patente=AB123CD");
    const condicional = await screen.findByTestId("venta-patente-12");
    expect(normal(condicional.textContent)).toContain("Pagó el 50%: faltan $ 35.500,00");
    expect(condicional).toHaveTextContent("Volvió: venta N° 13");
    expect(screen.getByTestId("venta-patente-13")).toHaveTextContent(
      "Vuelta: pagó el 50% restante de la N° 12",
    );
    expect(screen.getByTestId("venta-patente-14")).toHaveTextContent(
      "Vuelve a “Auto” pagando el resto",
    );
  });

  it("pide al menos 3 caracteres y no consulta", async () => {
    renderPagina();
    await userEvent.type(screen.getByLabelText("Patente"), "AB{Enter}");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Escribí al menos 3 caracteres de la patente.",
    );
    expect(argumentosRpc("ventas_por_patente")).toBeUndefined();
  });

  it("sin resultados lo dice; un error se muestra", async () => {
    responderRpc("ventas_por_patente", { data: [] });
    renderPagina("/patentes?patente=ZZZ");
    expect(
      await screen.findByText("No hay ventas de patentes que empiecen con “ZZZ”."),
    ).toBeInTheDocument();
  });

  it("muestra el error de la BD", async () => {
    responderRpc("ventas_por_patente", {
      error: { code: "42501", message: "Solo un administrador puede hacer esto" },
    });
    renderPagina("/patentes?patente=AB1");
    expect(await screen.findByText("Solo un administrador puede hacer esto")).toBeInTheDocument();
  });
});

describe("normalizarPatente", () => {
  it("deja mayúsculas, letras y números", () => {
    expect(normalizarPatente(" ab-12 3cd ")).toBe("AB123CD");
  });
});
