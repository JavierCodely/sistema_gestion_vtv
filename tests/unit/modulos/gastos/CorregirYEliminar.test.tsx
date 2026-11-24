import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Gasto } from "@/modulos/gastos/api/consultas";
import { CategoriasGasto } from "@/modulos/gastos/componentes/CategoriasGasto";
import { DialogoGasto } from "@/modulos/gastos/componentes/DialogoGasto";
import { TablaGastos } from "@/modulos/gastos/componentes/TablaGastos";
import { categoriasParaCargar } from "@/modulos/gastos/lib/categorias";
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

const base = { habilitada_caja: false, activa: true, sistema: null };
const CATEGORIAS = [
  { ...base, id: 1, nombre: "Insumos", padre_id: null },
  { ...base, id: 2, nombre: "Papelería", padre_id: 1 },
  { ...base, id: 3, nombre: "Compra de certificados", padre_id: 1, sistema: "compra_certificados" },
  { ...base, id: 4, nombre: "Varios", padre_id: null },
  { ...base, id: 5, nombre: "Otros", padre_id: 4 },
  { ...base, id: 6, nombre: "Viejos", padre_id: 4, activa: false },
];

const gasto = (cambios: Partial<Gasto> = {}): Gasto => ({
  id: 10,
  fecha: "2026-11-03T13:00:00-03:00",
  turno_id: null,
  caja_nombre: null,
  usuario_nombre: "Ana Admin",
  concepto: "Viejos",
  detalle: "Varios",
  medio: "efectivo",
  monto: -1500.5,
  nota: "Algo viejo",
  anulada: false,
  motivo_anulacion: null,
  categoria_gasto_id: 6,
  reemplazado_por: null,
  corrige_a: null,
  ...cambios,
});

beforeEach(() => {
  reiniciarSupabaseFalso();
  responder("categorias_gasto", "select", { data: CATEGORIAS });
});

describe("categoriasParaCargar al corregir", () => {
  it("incluye la subcategoría del gasto aunque esté desactivada, nunca la del sistema", () => {
    const nombres = (incluir?: number) =>
      categoriasParaCargar(CATEGORIAS, { soloCaja: false, incluir }).flatMap((r) =>
        r.subcategorias.map((s) => s.nombre),
      );
    expect(nombres()).toEqual(["Papelería", "Otros"]);
    expect(nombres(6)).toEqual(["Papelería", "Otros", "Viejos"]);
    expect(nombres(3)).toEqual(["Papelería", "Otros"]);
  });
});

describe("DialogoGasto: corregir", () => {
  it("arranca con los datos del gasto, exige el motivo y manda la corrección", async () => {
    responderRpc("corregir_gasto", { data: { id: 11, monto: 1800 } });
    const onCerrar = vi.fn();
    renderConQuery(
      <DialogoGasto
        soloCaja={false}
        gasto={gasto()}
        descripcion="Corrección"
        onCerrar={onCerrar}
      />,
    );
    expect(await screen.findByRole("heading", { name: "Corregir gasto" })).toBeInTheDocument();
    expect(await screen.findByLabelText("Monto ($)")).toHaveValue("1500,50");
    expect(screen.getByLabelText("Nota")).toHaveValue("Algo viejo");
    expect(screen.getByLabelText("Categoría")).toHaveTextContent("Viejos");
    expect(screen.getByLabelText("Pagado con")).toHaveTextContent("Efectivo (caja de cambio)");

    await userEvent.click(screen.getByRole("button", { name: "Guardar corrección" }));
    expect(screen.getByText("Escribí el motivo.")).toBeInTheDocument();
    expect(argumentosRpc("corregir_gasto")).toBeUndefined();

    const monto = screen.getByLabelText("Monto ($)");
    await userEvent.clear(monto);
    await userEvent.type(monto, "1.800");
    await userEvent.click(screen.getByLabelText("Categoría"));
    await userEvent.click(await screen.findByRole("option", { name: "Otros" }));
    await userEvent.type(screen.getByLabelText("Motivo de la corrección"), "Era otro monto");
    await userEvent.click(screen.getByRole("button", { name: "Guardar corrección" }));
    await waitFor(() => {
      expect(onCerrar).toHaveBeenCalled();
    });
    expect(argumentosRpc("corregir_gasto")).toEqual({
      p_gasto_id: 10,
      p_categoria_id: 5,
      p_monto: 1800,
      p_fuente: "efectivo",
      p_nota: "Algo viejo",
      p_motivo: "Era otro monto",
    });
  });

  it("muestra el rechazo de la BD y no cierra", async () => {
    responderRpc("corregir_gasto", {
      error: { code: "P0001", message: "El gasto ya estaba anulado: no se puede corregir" },
    });
    const onCerrar = vi.fn();
    renderConQuery(
      <DialogoGasto
        soloCaja={false}
        gasto={gasto()}
        descripcion="Corrección"
        onCerrar={onCerrar}
      />,
    );
    await userEvent.type(await screen.findByLabelText("Motivo de la corrección"), "x");
    await userEvent.click(screen.getByRole("button", { name: "Guardar corrección" }));
    expect(
      await screen.findByText("El gasto ya estaba anulado: no se puede corregir"),
    ).toBeInTheDocument();
    expect(onCerrar).not.toHaveBeenCalled();
  });

  it("un gasto de un turno ofrece el efectivo de la caja", async () => {
    renderConQuery(
      <DialogoGasto
        soloCaja={false}
        gasto={gasto({ turno_id: 3, categoria_gasto_id: 2, concepto: "Papelería" })}
        descripcion="Corrección"
        onCerrar={vi.fn()}
      />,
    );
    expect(await screen.findByLabelText("Pagado con")).toHaveTextContent("Efectivo (de la caja)");
  });
});

describe("TablaGastos: correcciones", () => {
  it("marca el original como corregido (con el motivo) y el nuevo como corrección", () => {
    renderConQuery(
      <TablaGastos
        vacio="Nada"
        gastos={[
          gasto({ id: 11, corrige_a: 10 }),
          gasto({ anulada: true, reemplazado_por: 11, motivo_anulacion: "Era otro monto" }),
          gasto({ id: 9, anulada: true, motivo_anulacion: "Duplicado" }),
        ]}
      />,
    );
    const estado = (id: number) => within(screen.getByTestId(`gasto-${String(id)}`));
    expect(estado(11).getByText("Corrección")).toBeInTheDocument();
    expect(estado(10).getByText("Corregido")).toBeInTheDocument();
    expect(estado(10).getByText("Era otro monto")).toBeInTheDocument();
    expect(estado(10).queryByText("Anulado")).not.toBeInTheDocument();
    expect(estado(9).getByText("Anulado")).toBeInTheDocument();
  });
});

describe("CategoriasGasto: eliminar", () => {
  it("no ofrece eliminar la categoría del sistema ni su rubro", async () => {
    renderConQuery(<CategoriasGasto />);
    expect(await screen.findByRole("button", { name: "Eliminar Papelería" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Eliminar Varios" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Eliminar Compra de certificados" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Eliminar Insumos" })).not.toBeInTheDocument();
  });

  it("confirma y elimina un rubro con sus subcategorías", async () => {
    responderRpc("eliminar_categoria_gasto", { data: CATEGORIAS[3] });
    renderConQuery(<CategoriasGasto />);
    await userEvent.click(await screen.findByRole("button", { name: "Eliminar Varios" }));
    const dialogo = screen.getByRole("dialog", { name: "Eliminar rubro" });
    expect(dialogo).toHaveTextContent(
      "¿Eliminar el rubro “Varios”? También se eliminan sus 2 subcategorías.",
    );
    await userEvent.click(within(dialogo).getByRole("button", { name: "Eliminar" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(argumentosRpc("eliminar_categoria_gasto")).toEqual({ p_categoria_id: 4 });
  });

  it("si tiene gastos, muestra el mensaje de la BD y no cierra", async () => {
    responderRpc("eliminar_categoria_gasto", {
      error: {
        code: "P0001",
        message: 'La subcategoría "Papelería" ya tiene gastos: desactivala en vez de eliminarla',
      },
    });
    renderConQuery(<CategoriasGasto />);
    await userEvent.click(await screen.findByRole("button", { name: "Eliminar Papelería" }));
    const dialogo = screen.getByRole("dialog", { name: "Eliminar subcategoría" });
    await userEvent.click(within(dialogo).getByRole("button", { name: "Eliminar" }));
    expect(
      await within(dialogo).findByText(
        'La subcategoría "Papelería" ya tiene gastos: desactivala en vez de eliminarla',
      ),
    ).toBeInTheDocument();
  });
});
