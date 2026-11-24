import { describe, expect, it } from "vitest";
import {
  validarObservaciones,
  validarVenta,
  type FormularioVenta,
} from "@/modulos/caja/lib/validaciones";

const venta = (cambios: Partial<FormularioVenta> = {}): FormularioVenta => ({
  servicioId: 3,
  cobro: { medio: "efectivo" },
  patente: "AB123CD",
  descuentoId: null,
  precioEsperado: 18000,
  condicional: false,
  condicionalMitad: false,
  ...cambios,
});

describe("validarVenta", () => {
  it("exige servicio, medio de pago y patente", () => {
    expect(validarVenta(venta({ servicioId: null, cobro: null, patente: "" })).errores).toEqual({
      servicioId: "Elegí un servicio.",
      cobro: "Elegí el medio de pago.",
      patente: "Ingresá la patente del vehículo.",
    });
  });

  it("normaliza la patente como la BD; en blanco no se acepta", () => {
    expect(validarVenta(venta({ cobro: { medio: "tarjeta" }, patente: " ab 123 cd " }))).toEqual({
      datos: {
        servicioId: 3,
        cobro: { medio: "tarjeta" },
        patente: "AB123CD",
        descuentoId: null,
        precioEsperado: 18000,
        condicional: false,
        condicionalMitad: false,
      },
    });
    expect(validarVenta(venta({ patente: "  " })).errores).toEqual({
      patente: "Ingresá la patente del vehículo.",
    });
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
      patente: "AB123CD",
      descuentoId: 4,
      precioEsperado: 16200,
      condicional: false,
      condicionalMitad: false,
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

describe("validarVenta: condicional", () => {
  it("pasa el certificado condicional y el 50% tal cual (lo controla la BD)", () => {
    expect(
      validarVenta(venta({ condicional: true, condicionalMitad: true, precioEsperado: 35500 }))
        .datos,
    ).toMatchObject({
      condicional: true,
      condicionalMitad: true,
      precioEsperado: 35500,
    });
  });

  it("el 50% solo va con el certificado condicional", () => {
    expect(validarVenta(venta({ condicionalMitad: true })).datos).toMatchObject({
      condicional: false,
      condicionalMitad: false,
    });
  });
});
