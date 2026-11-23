import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DialogoDestinosCertificado } from "@/modulos/certificados/componentes/DialogoDestinosCertificado";
import type { Categoria, Servicio } from "@/modulos/servicios/api/consultas";
import { renderConQuery } from "@tests/soporte/render";
import { argumentosRpc, reiniciarSupabaseFalso, responderRpc } from "@tests/soporte/supabase-falso";

vi.mock("@/compartido/lib/supabase", async () => ({
  supabase: (await import("@tests/soporte/supabase-falso")).supabaseFalso,
}));

const CATEGORIAS: Categoria[] = [
  { id: 1, nombre: "Autos", activa: true },
  { id: 2, nombre: "Motos", activa: true },
  { id: 3, nombre: "Vieja", activa: false },
];
const SERVICIOS: Servicio[] = [
  {
    id: 5,
    nombre: "Auto",
    categoria_id: 1,
    precio: 20000,
    requiere_certificado: true,
    activo: true,
  },
  {
    id: 6,
    nombre: "Pickup",
    categoria_id: 1,
    precio: 25000,
    requiere_certificado: true,
    activo: true,
  },
  {
    id: 7,
    nombre: "Moto",
    categoria_id: 2,
    precio: 12000,
    requiere_certificado: true,
    activo: true,
  },
  {
    id: 8,
    nombre: "Reverificación",
    categoria_id: 2,
    precio: 0,
    requiere_certificado: false,
    activo: true,
  },
];

const NUEVO = {
  id: 9,
  nombre: "Hoja livianos",
  todos_servicios: false,
  categoria_ids: [] as number[],
  servicio_ids: [] as number[],
};

beforeEach(() => {
  reiniciarSupabaseFalso();
});

function abrir(certificado = NUEVO, onCerrar = vi.fn()) {
  renderConQuery(
    <DialogoDestinosCertificado
      certificado={certificado}
      categorias={CATEGORIAS}
      servicios={SERVICIOS}
      onCerrar={onCerrar}
    />,
  );
  return onCerrar;
}

describe("DialogoDestinosCertificado", () => {
  it("mezcla una categoría entera y un servicio suelto y los guarda de una vez", async () => {
    responderRpc("fijar_destinos_certificado", { data: null });
    const onCerrar = abrir();
    expect(screen.getByTestId("resumen-destinos")).toHaveTextContent("Ningún servicio");

    await userEvent.click(screen.getByRole("switch", { name: "Toda la categoría Autos" }));
    await userEvent.click(screen.getByRole("switch", { name: "Moto" }));
    expect(screen.getByTestId("resumen-destinos")).toHaveTextContent("1 categoría y 1 servicio");

    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => {
      expect(onCerrar).toHaveBeenCalled();
    });
    expect(argumentosRpc("fijar_destinos_certificado")).toEqual({
      p_certificado_id: 9,
      p_todos: false,
      p_categoria_ids: [1],
      p_servicio_ids: [7],
    });
  });

  it("con la categoría entera, sus servicios quedan incluidos y no se eligen sueltos", async () => {
    abrir({ ...NUEVO, servicio_ids: [5] });
    await userEvent.click(screen.getByRole("switch", { name: "Toda la categoría Autos" }));
    const autos = screen.getByTestId("destinos-Autos");
    for (const nombre of ["Auto", "Pickup"]) {
      const sw = within(autos).getByRole("switch", { name: nombre });
      expect(sw).toBeChecked();
      expect(sw).toBeDisabled();
    }
    expect(within(autos).getAllByText("Incluido por la categoría")).toHaveLength(2);
    // El suelto que tenía se quitó: lo cubre la categoría.
    expect(screen.getByTestId("resumen-destinos")).toHaveTextContent("1 categoría");
  });

  it("precarga lo guardado y marca desactivadas y servicios sin hoja", () => {
    abrir({ ...NUEVO, categoria_ids: [2], servicio_ids: [6] });
    expect(screen.getByRole("switch", { name: "Toda la categoría Motos" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "Pickup" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "Auto" })).not.toBeChecked();
    expect(
      within(screen.getByTestId("destinos-Vieja")).getByText("Desactivada"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("destinos-Motos")).getByText("No usa hoja"),
    ).toBeInTheDocument();
  });

  it("'Todos los servicios' oculta la lista y manda las listas vacías", async () => {
    responderRpc("fijar_destinos_certificado", { data: null });
    abrir({ ...NUEVO, categoria_ids: [2] });
    await userEvent.click(screen.getByRole("switch", { name: /Todos los servicios/ }));
    expect(screen.queryByTestId("destinos-Autos")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => {
      expect(argumentosRpc("fijar_destinos_certificado")).toEqual({
        p_certificado_id: 9,
        p_todos: true,
        p_categoria_ids: [],
        p_servicio_ids: [],
      });
    });
  });

  it("muestra el choque con otro certificado activo tal como lo explica la BD", async () => {
    const mensaje =
      'La categoría "Autos" ya usa el certificado activo "Hoja VTV". Desactivalo o quitale esa categoría antes.';
    responderRpc("fijar_destinos_certificado", { error: { code: "P0001", message: mensaje } });
    const onCerrar = abrir();
    await userEvent.click(screen.getByRole("switch", { name: "Toda la categoría Autos" }));
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(mensaje);
    expect(onCerrar).not.toHaveBeenCalled();
  });
});
