import { describe, expect, it } from "vitest";
import {
  formatearMedios,
  formatearServicios,
  formatearValorImpuesto,
} from "@/modulos/impuestos/lib/formato";
import {
  aniosDisponibles,
  nombreDePeriodo,
  periodoActual,
  PRIMER_ANIO,
  rangoDePeriodo,
} from "@/modulos/impuestos/lib/periodo";
import { validarImpuesto, type FormularioImpuesto } from "@/modulos/impuestos/lib/validaciones";

const formulario = (cambios: Partial<FormularioImpuesto> = {}): FormularioImpuesto => ({
  nombre: "IIBB",
  tipo: "porcentaje",
  valor: "3",
  medios: ["efectivo", "transferencia", "tarjeta"],
  activo: true,
  ...cambios,
});

describe("validarImpuesto", () => {
  it("arma los datos a guardar con los medios sin repetir y en orden", () => {
    expect(
      validarImpuesto(formulario({ medios: ["tarjeta", "efectivo", "tarjeta"] })).datos,
    ).toEqual({
      nombre: "IIBB",
      tipo: "porcentaje",
      valor: 3,
      medios: ["efectivo", "tarjeta"],
      activo: true,
    });
  });

  it("rechaza un porcentaje de 100 o más, un valor inválido y la falta de medios", () => {
    expect(validarImpuesto(formulario({ valor: "100" })).errores?.valor).toBe(
      "El porcentaje tiene que ser menor a 100.",
    );
    expect(validarImpuesto(formulario({ valor: "0" })).errores?.valor).toBeDefined();
    expect(validarImpuesto(formulario({ valor: "1,234" })).errores?.valor).toBeDefined();
    expect(validarImpuesto(formulario({ medios: [] })).errores?.medios).toBe(
      "Elegí al menos un medio de pago.",
    );
    expect(validarImpuesto(formulario({ nombre: "  " })).errores?.nombre).toBeDefined();
  });

  it("un monto fijo puede ser de 100 o más", () => {
    expect(
      validarImpuesto(formulario({ tipo: "monto_fijo", valor: "1.500,50" })).datos?.valor,
    ).toBe(1500.5);
  });
});

describe("período del reporte", () => {
  it("año entero o un mes (con bisiestos y diciembre)", () => {
    expect(rangoDePeriodo({ anio: 2027, mes: null })).toEqual({
      desde: "2027-01-01",
      hasta: "2027-12-31",
    });
    expect(rangoDePeriodo({ anio: 2026, mes: 2 })).toEqual({
      desde: "2026-02-01",
      hasta: "2026-02-28",
    });
    expect(rangoDePeriodo({ anio: 2028, mes: 2 })).toEqual({
      desde: "2028-02-01",
      hasta: "2028-02-29",
    });
    expect(rangoDePeriodo({ anio: 2026, mes: 12 })).toEqual({
      desde: "2026-12-01",
      hasta: "2026-12-31",
    });
  });

  it("el período actual es el mes en hora argentina", () => {
    // 1/12 01:00 UTC = 30/11 22:00 en Argentina
    expect(periodoActual(new Date("2026-12-01T01:00:00Z"))).toEqual({ anio: 2026, mes: 11 });
  });

  it("los años van del siguiente al actual hasta el primero", () => {
    const anios = aniosDisponibles(new Date("2026-11-22T15:00:00Z"));
    expect(anios[0]).toBe(2027);
    expect(anios.at(-1)).toBe(PRIMER_ANIO);
  });

  it("nombre del período", () => {
    expect(nombreDePeriodo({ anio: 2027, mes: null })).toBe("Año 2027");
    expect(nombreDePeriodo({ anio: 2026, mes: 3 })).toBe("Marzo de 2026");
  });
});

describe("formato", () => {
  it("valor, medios y servicios", () => {
    expect(formatearValorImpuesto({ tipo: "porcentaje", valor: 3.5 })).toBe("3,5 %");
    expect(formatearValorImpuesto({ tipo: "monto_fijo", valor: 150 }).replace(/\s/g, " ")).toBe(
      "$ 150,00 por venta",
    );
    expect(formatearMedios(["tarjeta", "efectivo", "transferencia"])).toBe("Todos");
    expect(formatearMedios(["tarjeta", "efectivo"])).toBe("Efectivo y Tarjeta");
    expect(formatearServicios({ todos_servicios: true, servicioIds: [] })).toBe("Todos");
    expect(formatearServicios({ todos_servicios: false, servicioIds: [] })).toBe("Ninguno");
    expect(formatearServicios({ todos_servicios: false, servicioIds: [1] })).toBe("1 servicio");
  });
});
