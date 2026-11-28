import { describe, expect, it } from "vitest";
import {
  formatearMedios,
  formatearServicios,
  formatearValorImpuesto,
} from "@/modulos/impuestos/lib/formato";
import { validarImpuesto, type FormularioImpuesto } from "@/modulos/impuestos/lib/validaciones";

const formulario = (cambios: Partial<FormularioImpuesto> = {}): FormularioImpuesto => ({
  nombre: "IIBB",
  tipo: "porcentaje",
  valor: "3",
  medios: ["efectivo", "transferencia"],
  activo: true,
  ...cambios,
});

describe("validarImpuesto", () => {
  it("arma los datos a guardar con los medios sin repetir y en orden", () => {
    expect(
      validarImpuesto(formulario({ medios: ["transferencia", "efectivo", "transferencia"] })).datos,
    ).toEqual({
      nombre: "IIBB",
      tipo: "porcentaje",
      valor: 3,
      medios: ["efectivo", "transferencia"],
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

describe("formato", () => {
  it("valor, medios y servicios", () => {
    expect(formatearValorImpuesto({ tipo: "porcentaje", valor: 3.5 })).toBe("3,5 %");
    expect(formatearValorImpuesto({ tipo: "monto_fijo", valor: 150 }).replace(/\s/g, " ")).toBe(
      "$ 150,00 por venta",
    );
    expect(formatearMedios(["transferencia", "efectivo"])).toBe("Todos");
    expect(formatearMedios(["transferencia"])).toBe("Transferencia");
    expect(formatearServicios({ todos_servicios: true, servicioIds: [] })).toBe("Todos");
    expect(formatearServicios({ todos_servicios: false, servicioIds: [] })).toBe("Ninguno");
    expect(formatearServicios({ todos_servicios: false, servicioIds: [1] })).toBe("1 servicio");
  });
});
