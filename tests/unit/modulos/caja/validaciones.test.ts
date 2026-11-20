import { describe, expect, it } from "vitest";
import {
  normalizarPatente,
  validarObservaciones,
  validarVenta,
} from "@/modulos/caja/lib/validaciones";

describe("validarVenta", () => {
  it("exige servicio y medio de pago", () => {
    expect(validarVenta({ servicioId: "", medioPago: "", patente: "" }).errores).toEqual({
      servicioId: "Elegí un servicio.",
      medioPago: "Elegí el medio de pago.",
    });
  });

  it("normaliza la patente como la BD y la deja en null si está vacía", () => {
    expect(validarVenta({ servicioId: "3", medioPago: "tarjeta", patente: " ab 123 cd " })).toEqual(
      { datos: { servicioId: 3, medioPago: "tarjeta", patente: "AB123CD" } },
    );
    expect(validarVenta({ servicioId: "3", medioPago: "efectivo", patente: "  " }).datos).toEqual({
      servicioId: 3,
      medioPago: "efectivo",
      patente: null,
    });
  });

  it("la patente respeta el largo máximo de la BD (sin contar espacios)", () => {
    expect(
      validarVenta({ servicioId: "3", medioPago: "efectivo", patente: "ABCDE 12345" }).datos,
    ).toBeDefined();
    expect(
      validarVenta({ servicioId: "3", medioPago: "efectivo", patente: "ABCDE123456" }).errores,
    ).toEqual({ patente: "La patente no puede superar los 10 caracteres." });
  });
});

describe("normalizarPatente", () => {
  it("saca espacios y pasa a mayúsculas", () => {
    expect(normalizarPatente("ab 123\tcd")).toBe("AB123CD");
  });
});

describe("validarObservaciones", () => {
  it("son opcionales y tienen el largo de la BD", () => {
    expect(validarObservaciones("")).toBeUndefined();
    expect(validarObservaciones("x".repeat(1000))).toBeUndefined();
    expect(validarObservaciones("x".repeat(1001))).toBe(
      "Las observaciones no pueden superar los 1000 caracteres.",
    );
  });
});
