import { describe, expect, it } from "vitest";
import {
  validarObservaciones,
  validarVenta,
  type FormularioVenta,
} from "@/modulos/caja/lib/validaciones";

const venta = (cambios: Partial<FormularioVenta> = {}): FormularioVenta => ({
  servicioId: 3,
  cobro: { medio: "efectivo" },
  patente: "",
  descuentoId: null,
  precioEsperado: 18000,
  ...cambios,
});

describe("validarVenta", () => {
  it("exige servicio y medio de pago", () => {
    expect(validarVenta(venta({ servicioId: null, cobro: null })).errores).toEqual({
      servicioId: "Elegí un servicio.",
      cobro: "Elegí el medio de pago.",
    });
  });

  it("normaliza la patente como la BD y la deja en null si está vacía", () => {
    expect(validarVenta(venta({ cobro: { medio: "tarjeta" }, patente: " ab 123 cd " }))).toEqual({
      datos: {
        servicioId: 3,
        cobro: { medio: "tarjeta" },
        patente: "AB123CD",
        descuentoId: null,
        precioEsperado: 18000,
      },
    });
    expect(validarVenta(venta({ patente: "  " })).datos?.patente).toBeNull();
  });

  it("pasa el pago mixto, el descuento y el precio esperado tal cual (los valida la BD)", () => {
    const cobro = {
      pagos: [
        { medio: "efectivo" as const, monto: 5000 },
        { medio: "tarjeta" as const, monto: 13000 },
      ],
    };
    expect(validarVenta(venta({ cobro, descuentoId: 4, precioEsperado: 16200 })).datos).toEqual({
      servicioId: 3,
      cobro,
      patente: null,
      descuentoId: 4,
      precioEsperado: 16200,
    });
  });

  it("la patente respeta el largo máximo de la BD (sin contar espacios)", () => {
    expect(validarVenta(venta({ patente: "ABCDE 12345" })).datos).toBeDefined();
    expect(validarVenta(venta({ patente: "ABCDE123456" })).errores).toEqual({
      patente: "La patente no puede superar los 10 caracteres.",
    });
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
