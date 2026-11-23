import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DialogoCertificado } from "@/modulos/certificados/componentes/DialogoCertificado";
import { renderConQuery } from "@tests/soporte/render";
import { argumentosDe, reiniciarSupabaseFalso, responder } from "@tests/soporte/supabase-falso";
import { certificadoDePrueba } from "./datos";

vi.mock("@/compartido/lib/supabase", async () => ({
  supabase: (await import("@tests/soporte/supabase-falso")).supabaseFalso,
}));

async function elegir(etiqueta: string, opcion: string) {
  await userEvent.click(screen.getByLabelText(etiqueta));
  await userEvent.click(await screen.findByRole("option", { name: opcion }));
}

beforeEach(() => {
  reiniciarSupabaseFalso();
});

describe("DialogoCertificado", () => {
  it("una hoja suelta fija 1 hoja por unidad", async () => {
    renderConQuery(<DialogoCertificado onCerrar={vi.fn()} />);
    await elegir("Se compra por", "Hoja suelta");
    expect(screen.getByLabelText("Hojas por unidad")).toBeDisabled();
    expect(screen.getByLabelText("Hojas por unidad")).toHaveValue("1");
  });

  it("crea un certificado con los datos de la tabla", async () => {
    responder("certificados", "insert", { data: { id: 9, nombre: "Hoja moto" } });
    const onCerrar = vi.fn();
    renderConQuery(<DialogoCertificado onCerrar={onCerrar} />);
    await userEvent.type(screen.getByLabelText("Nombre"), "Hoja moto");
    await elegir("Se compra por", "Libreta");
    await userEvent.type(screen.getByLabelText("Hojas por unidad"), "50");
    await userEvent.clear(screen.getByLabelText("Stock mínimo (hojas)"));
    await userEvent.type(screen.getByLabelText("Stock mínimo (hojas)"), "20");
    await userEvent.click(screen.getByRole("button", { name: "Crear certificado" }));
    await waitFor(() => {
      expect(onCerrar).toHaveBeenCalled();
    });
    expect(argumentosDe("certificados", "insert")).toEqual([
      {
        nombre: "Hoja moto",
        unidad_compra: "libreta",
        hojas_por_unidad: 50,
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
    renderConQuery(<DialogoCertificado onCerrar={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Nombre"), "Otra global");
    await userEvent.type(screen.getByLabelText("Hojas por unidad"), "25");
    await userEvent.click(screen.getByRole("button", { name: "Crear certificado" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ya hay un certificado activo para todos los servicios. Desactivalo antes de activar otro.",
    );
  });

  it("al editar precarga los datos y guarda los cambios", async () => {
    responder("certificados", "update", { data: { id: 4, nombre: "Hoja vieja 2" } });
    const onCerrar = vi.fn();
    renderConQuery(
      <DialogoCertificado
        certificado={certificadoDePrueba({
          nombre: "Hoja vieja",
          unidad_compra: "libreta",
          hojas_por_unidad: 50,
          stock_minimo: 7,
        })}
        onCerrar={onCerrar}
      />,
    );
    expect(screen.getByRole("heading", { name: "Editar certificado" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nombre")).toHaveValue("Hoja vieja");
    expect(screen.getByLabelText("Hojas por unidad")).toHaveValue("50");
    expect(screen.getByLabelText("Stock mínimo (hojas)")).toHaveValue("7");

    await userEvent.clear(screen.getByLabelText("Nombre"));
    await userEvent.type(screen.getByLabelText("Nombre"), "Hoja vieja 2");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => {
      expect(onCerrar).toHaveBeenCalled();
    });
    expect(argumentosDe("certificados", "update")).toEqual([
      {
        nombre: "Hoja vieja 2",
        unidad_compra: "libreta",
        hojas_por_unidad: 50,
        stock_minimo: 7,
      },
    ]);
  });
});
