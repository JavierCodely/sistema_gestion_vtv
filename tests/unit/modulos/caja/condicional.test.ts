import { describe, expect, it } from "vitest";
import { mitadCondicional, saldoCondicional } from "@/modulos/caja/lib/condicional";

describe("condicional al 50%", () => {
  it("cobra la mitad redondeada a centavos y el resto queda para la vuelta (suman el precio)", () => {
    expect(mitadCondicional(71000)).toBe(35500);
    expect(saldoCondicional(71000)).toBe(35500);
    expect(mitadCondicional(12500.5)).toBe(6250.25);
    expect(saldoCondicional(12500.5)).toBe(6250.25);
    // Un centavo impar: como round(precio / 2, 2) de la BD, la mitad se lleva el redondeo
    expect(mitadCondicional(100.01)).toBe(50.01);
    expect(saldoCondicional(100.01)).toBe(50);
  });
});
