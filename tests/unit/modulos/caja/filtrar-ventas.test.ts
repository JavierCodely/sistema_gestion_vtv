import { describe, expect, it } from "vitest";
import {
  categoriasDeVentas,
  filtrarVentas,
  hayFiltros,
  SIN_FILTROS,
} from "@/modulos/caja/lib/filtrar-ventas";
import { ventaDePrueba } from "@tests/unit/modulos/ventas/datos";

const autos = { categoria_id: 1, categorias_servicio: { nombre: "Autos" } };
const motos = { categoria_id: 2, categorias_servicio: { nombre: "Motos" } };

const VENTAS = [
  ventaDePrueba({ id: 4, patente: "AB123CD", ...autos }),
  ventaDePrueba({ id: 3, patente: "AC456EF", ...motos, medio_pago: "transferencia" }),
  ventaDePrueba({
    id: 2,
    patente: "AB999ZZ",
    ...autos,
    medio_pago: null,
    precio: 18000,
    venta_pagos: [
      { medio: "efectivo", monto: 5000 },
      { medio: "transferencia", monto: 13000 },
    ],
  }),
  ventaDePrueba({ id: 1, patente: null, ...motos, medio_pago: "transferencia" }),
];

const ids = (ventas: { id: number }[]) => ventas.map((v) => v.id);

describe("filtrarVentas", () => {
  it("sin filtros devuelve todas, en el mismo orden", () => {
    expect(ids(filtrarVentas(VENTAS, SIN_FILTROS))).toEqual([4, 3, 2, 1]);
    expect(hayFiltros(SIN_FILTROS)).toBe(false);
  });

  it("por categoría", () => {
    expect(ids(filtrarVentas(VENTAS, { ...SIN_FILTROS, categoriaId: 2 }))).toEqual([3, 1]);
  });

  it("por medio: una mixta aparece en cada medio que usó; 'mixto', solo las mixtas", () => {
    expect(ids(filtrarVentas(VENTAS, { ...SIN_FILTROS, medio: "efectivo" }))).toEqual([4, 2]);
    expect(ids(filtrarVentas(VENTAS, { ...SIN_FILTROS, medio: "transferencia" }))).toEqual([
      3, 2, 1,
    ]);
    expect(ids(filtrarVentas(VENTAS, { ...SIN_FILTROS, medio: "mixto" }))).toEqual([2]);
  });

  it("combina patente, categoría y medio", () => {
    const filtro = { patente: "AB", categoriaId: 1, medio: "transferencia" as const };
    expect(ids(filtrarVentas(VENTAS, filtro))).toEqual([2]);
    expect(hayFiltros(filtro)).toBe(true);
  });
});

describe("categoriasDeVentas", () => {
  it("las categorías de la lista, sin repetir y por nombre", () => {
    expect(categoriasDeVentas([...VENTAS].reverse())).toEqual([
      { id: 1, nombre: "Autos" },
      { id: 2, nombre: "Motos" },
    ]);
  });
});
