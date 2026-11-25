import { describe, expect, it } from "vitest";
import { filtrarPorPatente, patenteABuscar } from "@/modulos/caja/lib/buscar-patente";

describe("patenteABuscar", () => {
  it("normaliza y exige al menos 3 caracteres", () => {
    expect(patenteABuscar("")).toBeNull();
    expect(patenteABuscar(" a b ")).toBeNull();
    expect(patenteABuscar("ab 1")).toBe("AB1");
    expect(patenteABuscar("ab123cd")).toBe("AB123CD");
  });
});

describe("filtrarPorPatente", () => {
  const ventas = [
    { id: 1, patente: "AB123CD" },
    { id: 2, patente: "AC456EF" },
    { id: 3, patente: null },
  ];

  it("sin búsqueda devuelve todas", () => {
    expect(filtrarPorPatente(ventas, null)).toEqual(ventas);
  });

  it("devuelve las que empiezan con la patente buscada (no las que la contienen)", () => {
    expect(filtrarPorPatente(ventas, "AB1").map((v) => v.id)).toEqual([1]);
    expect(filtrarPorPatente(ventas, "123")).toEqual([]);
  });
});
