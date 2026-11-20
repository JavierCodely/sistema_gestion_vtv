import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DialogoCertificado } from "@/modulos/certificados/componentes/DialogoCertificado";
import type { Categoria, Servicio } from "@/modulos/servicios/api/consultas";
import { renderConQuery } from "@tests/soporte/render";
import { argumentosDe, reiniciarSupabaseFalso, responder } from "@tests/soporte/supabase-falso";
import { certificadoDePrueba } from "./datos";

vi.mock("@/compartido/lib/supabase", async () => ({
  supabase: (await import("@tests/soporte/supabase-falso")).supabaseFalso,
}));

const CATEGORIAS: Categoria[] = [
  { id: 1, nombre: "Vehicular", activa: true },
  { id: 2, nombre: "Vieja", activa: false },
];
const SERVICIOS: Servicio[] = [
  {
    id: 5,
    nombre: "Moto",
    categoria_id: 1,
    precio: 12000,
    requiere_certificado: true,
    activo: true,
  },
];

async function elegir(etiqueta: string, opcion: string) {
  await userEvent.click(screen.getByLabelText(etiqueta));
  await userEvent.click(await screen.findByRole("option", { name: opcion }));
}

beforeEach(() => {
  reiniciarSupabaseFalso();
});

describe("DialogoCertificado", () => {
  it("una hoja suelta fija 1 hoja por unidad", async () => {
    renderConQuery(
      <DialogoCertificado categorias={CATEGORIAS} servicios={SERVICIOS} onCerrar={vi.fn()} />,
    );
    await elegir("Se compra por", "Hoja suelta");
    expect(screen.getByLabelText("Hojas por unidad")).toBeDisabled();
    expect(screen.getByLabelText("Hojas por unidad")).toHaveValue("1");
  });

  it("para una categoría ofrece solo las activas", async () => {
    renderConQuery(
      <DialogoCertificado categorias={CATEGORIAS} servicios={SERVICIOS} onCerrar={vi.fn()} />,
    );
    await elegir("Se usa en", "Una categoría");
    await userEvent.click(screen.getByLabelText("Categoría"));
    const opciones = within(await screen.findByRole("listbox")).getAllByRole("option");
    expect(opciones.map((o) => o.textContent)).toEqual(["Vehicular"]);
  });

  it("crea un certificado por servicio con los datos de la tabla", async () => {
    responder("certificados", "insert", { data: { id: 9, nombre: "Hoja moto" } });
    const onCerrar = vi.fn();
    renderConQuery(
      <DialogoCertificado categorias={CATEGORIAS} servicios={SERVICIOS} onCerrar={onCerrar} />,
    );
    await userEvent.type(screen.getByLabelText("Nombre"), "Hoja moto");
    await elegir("Se compra por", "Libreta");
    await userEvent.type(screen.getByLabelText("Hojas por unidad"), "50");
    await elegir("Se usa en", "Un servicio");
    await elegir("Servicio", "Moto");
    await userEvent.clear(screen.getByLabelText("Stock mínimo (hojas)"));
    await userEvent.type(screen.getByLabelText("Stock mínimo (hojas)"), "20");
    await userEvent.click(screen.getByRole("button", { name: "Crear certificado" }));
    await vi.waitFor(() => {
      expect(onCerrar).toHaveBeenCalled();
    });
    expect(argumentosDe("certificados", "insert")).toEqual([
      {
        nombre: "Hoja moto",
        unidad_compra: "libreta",
        hojas_por_unidad: 50,
        alcance: "servicio",
        categoria_id: null,
        servicio_id: 5,
        stock_minimo: 20,
      },
    ]);
  });

  it("explica el choque de 'un activo por destino'", async () => {
    responder("certificados", "insert", {
      error: {
        code: "23505",
        message: 'duplicate key value violates unique constraint "certificados_un_global_activo"',
      },
    });
    renderConQuery(
      <DialogoCertificado categorias={CATEGORIAS} servicios={SERVICIOS} onCerrar={vi.fn()} />,
    );
    await userEvent.type(screen.getByLabelText("Nombre"), "Otra global");
    await userEvent.type(screen.getByLabelText("Hojas por unidad"), "25");
    await userEvent.click(screen.getByRole("button", { name: "Crear certificado" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ya hay un certificado activo para todos los servicios. Desactivalo antes de activar otro.",
    );
  });

  it("al editar precarga los datos, conserva un destino desactivado y guarda los cambios", async () => {
    responder("certificados", "update", { data: { id: 4, nombre: "Hoja vieja 2" } });
    const onCerrar = vi.fn();
    renderConQuery(
      <DialogoCertificado
        certificado={certificadoDePrueba({
          nombre: "Hoja vieja",
          unidad_compra: "libreta",
          hojas_por_unidad: 50,
          alcance: "categoria",
          categoria_id: 2,
          aplica_a: "Categoría: Vieja",
          stock_minimo: 7,
        })}
        categorias={CATEGORIAS}
        servicios={SERVICIOS}
        onCerrar={onCerrar}
      />,
    );
    expect(screen.getByRole("heading", { name: "Editar certificado" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nombre")).toHaveValue("Hoja vieja");
    expect(screen.getByLabelText("Hojas por unidad")).toHaveValue("50");
    expect(screen.getByLabelText("Stock mínimo (hojas)")).toHaveValue("7");
    expect(screen.getByLabelText("Categoría")).toHaveTextContent("Vieja (desactivado)");

    await userEvent.clear(screen.getByLabelText("Nombre"));
    await userEvent.type(screen.getByLabelText("Nombre"), "Hoja vieja 2");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await vi.waitFor(() => {
      expect(onCerrar).toHaveBeenCalled();
    });
    expect(argumentosDe("certificados", "update")).toEqual([
      {
        nombre: "Hoja vieja 2",
        unidad_compra: "libreta",
        hojas_por_unidad: 50,
        alcance: "categoria",
        categoria_id: 2,
        servicio_id: null,
        stock_minimo: 7,
      },
    ]);
  });
});
