import { describe, expect, it } from "vitest";
import type { CategoriaGasto } from "@/modulos/gastos/api/consultas";
import { agruparPorRubro, categoriasParaCargar } from "@/modulos/gastos/lib/categorias";
import { validarGasto } from "@/modulos/gastos/lib/validaciones";

function categoria(cambios: Partial<CategoriaGasto> & Pick<CategoriaGasto, "id" | "nombre">) {
  return {
    padre_id: null,
    habilitada_caja: false,
    activa: true,
    sistema: null,
    ...cambios,
  } satisfies CategoriaGasto;
}

const CATEGORIAS: CategoriaGasto[] = [
  categoria({ id: 1, nombre: "Insumos" }),
  categoria({ id: 2, nombre: "Papelería", padre_id: 1, habilitada_caja: true }),
  categoria({
    id: 3,
    nombre: "Compra de certificados",
    padre_id: 1,
    sistema: "compra_certificados",
  }),
  categoria({ id: 4, nombre: "Tóner", padre_id: 1 }),
  categoria({ id: 5, nombre: "Personal" }),
  categoria({ id: 6, nombre: "Sueldos", padre_id: 5 }),
  categoria({ id: 7, nombre: "Varios", activa: false }),
  categoria({ id: 8, nombre: "Otros", padre_id: 7, habilitada_caja: true }),
  categoria({ id: 9, nombre: "Agua", padre_id: 1, habilitada_caja: true, activa: false }),
];

describe("categorías de gasto", () => {
  it("agrupa rubros con sus subcategorías por nombre", () => {
    const rubros = agruparPorRubro(CATEGORIAS);
    expect(rubros.map((r) => r.rubro.nombre)).toEqual(["Insumos", "Personal", "Varios"]);
    expect(rubros[0]?.subcategorias.map((s) => s.nombre)).toEqual([
      "Agua",
      "Compra de certificados",
      "Papelería",
      "Tóner",
    ]);
  });

  it("el cajero solo carga en subcategorías activas, habilitadas y de un rubro activo", () => {
    const rubros = categoriasParaCargar(CATEGORIAS, { soloCaja: true });
    expect(rubros.map((r) => [r.rubro.nombre, r.subcategorias.map((s) => s.nombre)])).toEqual([
      ["Insumos", ["Papelería"]],
    ]);
  });

  it("el admin carga en cualquiera activa, nunca en las automáticas del sistema", () => {
    const rubros = categoriasParaCargar(CATEGORIAS, { soloCaja: false });
    expect(rubros.map((r) => [r.rubro.nombre, r.subcategorias.map((s) => s.nombre)])).toEqual([
      ["Insumos", ["Papelería", "Tóner"]],
      ["Personal", ["Sueldos"]],
    ]);
  });
});

describe("validarGasto", () => {
  it("junta todos los errores", () => {
    expect(validarGasto({ categoriaId: "", monto: "", fuente: "", nota: " " }).errores).toEqual({
      categoriaId: "Elegí una categoría.",
      monto: "Ingresá un monto.",
      fuente: "Elegí de dónde sale el dinero.",
      nota: "Escribí una nota.",
    });
  });

  it("acepta el formato argentino y limpia la nota", () => {
    expect(
      validarGasto({ categoriaId: "2", monto: "15.000,50", fuente: "efectivo", nota: " Resma " }),
    ).toEqual({ datos: { categoriaId: 2, monto: 15000.5, fuente: "efectivo", nota: "Resma" } });
  });

  it("rechaza montos que la BD rechazaría", () => {
    expect(
      validarGasto({ categoriaId: "2", monto: "10,555", fuente: "transferencia", nota: "x" })
        .errores?.monto,
    ).toBe("El monto no puede tener más de 2 decimales.");
    expect(
      validarGasto({ categoriaId: "2", monto: "0", fuente: "transferencia", nota: "x" }).errores
        ?.monto,
    ).toBe("El monto debe ser mayor a cero.");
  });
});
