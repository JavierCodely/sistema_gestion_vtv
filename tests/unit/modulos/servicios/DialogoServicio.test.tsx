import { screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DialogoServicio } from "@/modulos/servicios/componentes/DialogoServicio";
import type { Categoria, Servicio } from "@/modulos/servicios/api/consultas";
import { renderConQuery } from "@tests/soporte/render";
import { argumentosDe, reiniciarSupabaseFalso, responder } from "@tests/soporte/supabase-falso";

vi.mock("@/compartido/lib/supabase", async () => ({
  supabase: (await import("@tests/soporte/supabase-falso")).supabaseFalso,
}));

const CATEGORIAS: Categoria[] = [
  { id: 1, nombre: "Livianos", activa: true },
  { id: 2, nombre: "Antiguos", activa: false },
];

const SERVICIO_EN_DESACTIVADA: Servicio = {
  id: 7,
  nombre: "Auto antiguo",
  categoria_id: 2,
  precio: 15000.5,
  requiere_certificado: false,
  activo: true,
};

async function opcionesDeCategoria() {
  await userEvent.click(screen.getByLabelText("Categoría"));
  const lista = await screen.findByRole("listbox");
  return within(lista)
    .getAllByRole("option")
    .map((opcion) => opcion.textContent);
}

async function completar(nombre: string, precio: string) {
  await userEvent.type(screen.getByLabelText("Nombre"), nombre);
  await userEvent.type(screen.getByLabelText("Precio ($)"), precio);
  await userEvent.click(screen.getByRole("button", { name: "Crear servicio" }));
}

beforeEach(() => {
  reiniciarSupabaseFalso();
});

describe("DialogoServicio", () => {
  it("al crear solo ofrece categorías activas", async () => {
    renderConQuery(<DialogoServicio categorias={CATEGORIAS} onCerrar={vi.fn()} />);
    expect(await opcionesDeCategoria()).toEqual(["Livianos"]);
  });

  it("al editar conserva la categoría desactivada del servicio y precarga sus datos", async () => {
    renderConQuery(
      <DialogoServicio
        servicio={SERVICIO_EN_DESACTIVADA}
        categorias={CATEGORIAS}
        onCerrar={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Nombre")).toHaveValue("Auto antiguo");
    expect(screen.getByLabelText("Precio ($)")).toHaveValue("15000,50");
    expect(screen.getByLabelText("Usa hoja de certificado")).not.toBeChecked();
    expect(await opcionesDeCategoria()).toEqual(["Livianos", "Antiguos (desactivada)"]);
  });

  it("no preselecciona una categoría inicial desactivada", async () => {
    renderConQuery(
      <DialogoServicio categorias={CATEGORIAS} categoriaInicial={2} onCerrar={vi.fn()} />,
    );
    expect(screen.getByLabelText("Categoría")).toHaveTextContent("Elegí una categoría");
    await completar("Auto", "100");
    expect(screen.getByText("Elegí una categoría.")).toBeInTheDocument();
    expect(argumentosDe("servicios", "insert")).toBeUndefined();
  });

  it("crea el servicio con los datos convertidos y cierra", async () => {
    responder("servicios", "insert", {
      data: {
        id: 9,
        nombre: "Auto",
        categoria_id: 1,
        precio: 20000.5,
        requiere_certificado: true,
        activo: true,
      },
    });
    const onCerrar = vi.fn();
    renderConQuery(
      <DialogoServicio categorias={CATEGORIAS} categoriaInicial={1} onCerrar={onCerrar} />,
    );
    await completar(" Auto ", "20.000,50");
    await waitFor(() => {
      expect(onCerrar).toHaveBeenCalled();
    });
    expect(argumentosDe("servicios", "insert")).toEqual([
      { nombre: "Auto", categoria_id: 1, precio: 20000.5, requiere_certificado: true },
    ]);
  });

  it("muestra el nombre repetido con un mensaje propio y no cierra", async () => {
    responder("servicios", "insert", { error: { code: "23505", message: "duplicate key" } });
    const onCerrar = vi.fn();
    renderConQuery(
      <DialogoServicio categorias={CATEGORIAS} categoriaInicial={1} onCerrar={onCerrar} />,
    );
    await completar("Auto", "1");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ya existe un servicio con ese nombre.",
    );
    expect(onCerrar).not.toHaveBeenCalled();
  });
});
