import { describe, expect, it } from "vitest";
import {
  agruparServicios,
  cambiarCategoria,
  cambiarServicio,
  estadoCategoria,
} from "@/modulos/servicios/lib/seleccion-servicios";
import { formatearValorDescuento } from "@/modulos/descuentos/lib/formato";
import { validarDescuento, type FormularioDescuento } from "@/modulos/descuentos/lib/validaciones";
import type { Servicio } from "@/modulos/servicios/api/consultas";

const normal = (texto: string) => texto.replace(/\s/g, " ");

const formulario = (cambios: Partial<FormularioDescuento> = {}): FormularioDescuento => ({
  nombre: " Jubilados ",
  tipo: "porcentaje",
  valor: "10",
  activo: true,
  ...cambios,
});

describe("validarDescuento (espeja los CHECK de descuentos)", () => {
  it("porcentaje válido, con hasta 2 decimales y coma", () => {
    expect(validarDescuento(formulario()).datos).toEqual({
      nombre: "Jubilados",
      tipo: "porcentaje",
      valor: 10,
      activo: true,
    });
    expect(validarDescuento(formulario({ valor: "12,5" })).datos?.valor).toBe(12.5);
    expect(validarDescuento(formulario({ valor: "99,99" })).datos?.valor).toBe(99.99);
  });

  it("porcentaje mayor a 0 y menor a 100", () => {
    expect(validarDescuento(formulario({ valor: "0" })).errores).toEqual({
      valor: "El porcentaje debe ser mayor a cero.",
    });
    expect(validarDescuento(formulario({ valor: "100" })).errores).toEqual({
      valor: "El porcentaje tiene que ser menor a 100.",
    });
    expect(validarDescuento(formulario({ valor: "10,555" })).errores).toEqual({
      valor: "El porcentaje no puede tener más de 2 decimales.",
    });
    expect(validarDescuento(formulario({ valor: "" })).errores).toEqual({
      valor: "Ingresá un porcentaje.",
    });
  });

  it("monto fijo con formato argentino (sin tope de 100)", () => {
    expect(
      validarDescuento(formulario({ tipo: "monto_fijo", valor: "2.000,50", activo: false })).datos,
    ).toEqual({ nombre: "Jubilados", tipo: "monto_fijo", valor: 2000.5, activo: false });
    expect(validarDescuento(formulario({ tipo: "monto_fijo", valor: "abc" })).errores).toEqual({
      valor: "El monto no es válido.",
    });
  });

  it("nombre obligatorio y de hasta 100 caracteres", () => {
    expect(validarDescuento(formulario({ nombre: "  " })).errores).toEqual({
      nombre: "Ingresá el nombre.",
    });
    expect(validarDescuento(formulario({ nombre: "x".repeat(101) })).errores).toEqual({
      nombre: "El nombre no puede superar los 100 caracteres.",
    });
  });
});

describe("formato de descuentos", () => {
  it("valor: porcentaje o pesos", () => {
    expect(formatearValorDescuento({ tipo: "porcentaje", valor: 10 })).toBe("10 %");
    expect(formatearValorDescuento({ tipo: "porcentaje", valor: 12.5 })).toBe("12,5 %");
    expect(normal(formatearValorDescuento({ tipo: "monto_fijo", valor: 2000 }))).toBe("$ 2.000,00");
  });
});

const servicio = (id: number, nombre: string, categoria_id: number): Servicio => ({
  id,
  nombre,
  categoria_id,
  precio: 1000,
  requiere_certificado: false,
  activo: true,
});

describe("disponibilidad por servicio", () => {
  const autos = [servicio(1, "VTV auto", 1), servicio(2, "Reverificación", 1)];

  it("agrupa todas las categorías (también vacías) con sus servicios, por nombre", () => {
    const grupos = agruparServicios(
      [
        { id: 2, nombre: "Motos", activa: false },
        { id: 1, nombre: "Autos", activa: true },
      ],
      [...autos, servicio(3, "VTV moto", 2)],
    );
    expect(grupos.map((g) => [g.categoria.nombre, g.servicios.map((s) => s.nombre)])).toEqual([
      ["Autos", ["Reverificación", "VTV auto"]],
      ["Motos", ["VTV moto"]],
    ]);
  });

  it("estado de la categoría: todos, ninguno o parcial", () => {
    expect(estadoCategoria(autos, new Set())).toBe("ninguno");
    expect(estadoCategoria(autos, new Set([1]))).toBe("parcial");
    expect(estadoCategoria(autos, new Set([1, 2, 9]))).toBe("todos");
  });

  it("el switch de categoría prende o apaga todos sus servicios sin tocar los de otras", () => {
    expect([...cambiarCategoria(new Set([1, 9]), autos, true)].sort()).toEqual([1, 2, 9]);
    expect([...cambiarCategoria(new Set([1, 2, 9]), autos, false)]).toEqual([9]);
  });

  it("el switch de servicio cambia solo ese servicio", () => {
    expect([...cambiarServicio(new Set([1]), 2, true)].sort()).toEqual([1, 2]);
    expect([...cambiarServicio(new Set([1, 2]), 1, false)]).toEqual([2]);
  });
});
