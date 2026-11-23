import { describe, expect, it } from "vitest";
import {
  agruparPorCategoria,
  cambiarCategoriaEntera,
  cambiarServicioSuelto,
  destinosParaGuardar,
  resumirDestinos,
  type Destinos,
} from "@/modulos/certificados/lib/destinos";

const vacio: Destinos = { todos: false, categorias: new Set(), servicios: new Set() };

describe("destinos de un certificado", () => {
  it("prender una categoría entera quita sus servicios sueltos (ya los incluye)", () => {
    const conSueltos = { ...vacio, servicios: new Set([5, 6, 9]) };
    const resultado = cambiarCategoriaEntera(conSueltos, 1, [{ id: 5 }, { id: 6 }], true);
    expect([...resultado.categorias]).toEqual([1]);
    expect([...resultado.servicios]).toEqual([9]);
    expect([...conSueltos.servicios]).toEqual([5, 6, 9]);
  });

  it("apagar una categoría la quita sin tocar los servicios sueltos", () => {
    const destinos = { ...vacio, categorias: new Set([1, 2]), servicios: new Set([9]) };
    const resultado = cambiarCategoriaEntera(destinos, 1, [], false);
    expect([...resultado.categorias]).toEqual([2]);
    expect([...resultado.servicios]).toEqual([9]);
  });

  it("prende y apaga servicios sueltos", () => {
    const con = cambiarServicioSuelto(vacio, 5, true);
    expect([...con.servicios]).toEqual([5]);
    expect([...cambiarServicioSuelto(con, 5, false).servicios]).toEqual([]);
  });

  it("resume la elección", () => {
    expect(resumirDestinos({ ...vacio, todos: true, categorias: new Set([1]) })).toBe(
      "Todos los servicios",
    );
    expect(resumirDestinos(vacio)).toBe("Ningún servicio");
    expect(resumirDestinos({ ...vacio, categorias: new Set([1]) })).toBe("1 categoría");
    expect(
      resumirDestinos({ ...vacio, categorias: new Set([1, 2]), servicios: new Set([5]) }),
    ).toBe("2 categorías y 1 servicio");
    expect(resumirDestinos({ ...vacio, servicios: new Set([5, 6]) })).toBe("2 servicios");
  });

  it("arma las listas ordenadas para la RPC (vacías con 'todos')", () => {
    expect(
      destinosParaGuardar({
        todos: false,
        categorias: new Set([3, 1]),
        servicios: new Set([9, 5]),
      }),
    ).toEqual({ todos: false, categoriaIds: [1, 3], servicioIds: [5, 9] });
    expect(
      destinosParaGuardar({ todos: true, categorias: new Set([3]), servicios: new Set([9]) }),
    ).toEqual({ todos: true, categoriaIds: [], servicioIds: [] });
  });

  it("agrupa los servicios por categoría, por nombre", () => {
    const grupos = agruparPorCategoria(
      [
        { id: 2, nombre: "Motos", activa: true },
        { id: 1, nombre: "Autos", activa: false },
      ],
      [
        {
          id: 7,
          nombre: "Moto",
          categoria_id: 2,
          precio: 1,
          requiere_certificado: true,
          activo: true,
        },
        {
          id: 6,
          nombre: "Pickup",
          categoria_id: 1,
          precio: 1,
          requiere_certificado: true,
          activo: true,
        },
        {
          id: 5,
          nombre: "Auto",
          categoria_id: 1,
          precio: 1,
          requiere_certificado: true,
          activo: false,
        },
      ],
    );
    expect(grupos.map((g) => [g.categoria.nombre, g.servicios.map((s) => s.nombre)])).toEqual([
      ["Autos", ["Auto", "Pickup"]],
      ["Motos", ["Moto"]],
    ]);
  });
});
