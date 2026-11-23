import { describe, expect, it } from "vitest";
import {
  claseParaCondicion,
  cuitValido,
  validarCliente,
  validarConfiguracion,
  type FormularioCliente,
  type FormularioConfiguracion,
} from "@/modulos/facturacion/lib/validaciones";
import { CONDICIONES } from "./datos";

const cf: FormularioCliente = { condicionIvaId: "5", docTipo: "99", docNro: "", nombre: "" };

describe("cuitValido", () => {
  it("acepta CUIT con dígito verificador correcto, con o sin guiones", () => {
    expect(cuitValido("30712345671")).toBe(true);
    expect(cuitValido("30-71234567-1")).toBe(true);
    expect(cuitValido("20-12345678-6")).toBe(true);
  });
  it("rechaza dígito verificador incorrecto, largo inválido o letras", () => {
    expect(cuitValido("30712345672")).toBe(false);
    expect(cuitValido("3071234567")).toBe(false);
    expect(cuitValido("30a12345671")).toBe(false);
  });
});

describe("claseParaCondicion", () => {
  it("B si la condición la admite; si no A (tabla de ARCA)", () => {
    expect(claseParaCondicion(CONDICIONES[2])).toBe("B");
    expect(claseParaCondicion(CONDICIONES[0])).toBe("A");
    // Monotributista: según ARCA, Factura A con CUIT
    expect(claseParaCondicion(CONDICIONES[3])).toBe("A");
    expect(claseParaCondicion({ id: 99, descripcion: "X", clases: ["C"] })).toBeNull();
    expect(claseParaCondicion(undefined)).toBeNull();
  });
});

describe("validarCliente", () => {
  it("consumidor final sin identificar: doc 99 y número 0", () => {
    expect(validarCliente(cf, CONDICIONES).datos).toEqual({
      condicionIvaId: 5,
      docTipo: 99,
      docNro: 0,
      nombre: null,
    });
  });
  it("con DNI exige número y nombre; normaliza espacios", () => {
    expect(validarCliente({ ...cf, docTipo: "96" }, CONDICIONES).errores).toEqual({
      docNro: "El DNI no es válido.",
      nombre: "Ingresá el nombre o la razón social.",
    });
    expect(
      validarCliente(
        { ...cf, docTipo: "96", docNro: "30.111.222", nombre: "  Juan   Pérez " },
        CONDICIONES,
      ).datos,
    ).toEqual({ condicionIvaId: 5, docTipo: 96, docNro: 30111222, nombre: "Juan Pérez" });
  });
  it("Factura A exige CUIT válido", () => {
    expect(validarCliente({ ...cf, condicionIvaId: "1" }, CONDICIONES).errores?.docTipo).toBe(
      "La Factura A requiere CUIT.",
    );
    expect(
      validarCliente(
        { condicionIvaId: "1", docTipo: "80", docNro: "30-71234567-2", nombre: "SA" },
        CONDICIONES,
      ).errores?.docNro,
    ).toBe("El CUIT no es válido.");
    expect(
      validarCliente(
        { condicionIvaId: "1", docTipo: "80", docNro: "30-71234567-1", nombre: "Empresa SA" },
        CONDICIONES,
      ).datos,
    ).toEqual({ condicionIvaId: 1, docTipo: 80, docNro: 30712345671, nombre: "Empresa SA" });
  });
  it("solo el consumidor final puede quedar sin identificar", () => {
    expect(validarCliente({ ...cf, condicionIvaId: "4" }, CONDICIONES).errores?.docTipo).toBe(
      "Solo el consumidor final puede quedar sin identificar.",
    );
  });
  it("sin condición elegida", () => {
    expect(validarCliente({ ...cf, condicionIvaId: "" }, CONDICIONES).errores?.condicionIvaId).toBe(
      "Elegí la condición frente al IVA.",
    );
  });
});

describe("validarConfiguracion", () => {
  const valida: FormularioConfiguracion = {
    cuit: "30-71234567-1",
    razonSocial: " VTV   SA ",
    domicilio: "Calle 1",
    inicioActividades: "2020-01-01",
    iibb: "",
    puntoVenta: "3",
    ambiente: "homologacion",
    tope: "10.000.000",
  };
  it("convierte los datos para la BD", () => {
    expect(validarConfiguracion(valida).datos).toEqual({
      cuit: "30712345671",
      razon_social: "VTV SA",
      domicilio: "Calle 1",
      inicio_actividades: "2020-01-01",
      iibb: null,
      punto_venta: 3,
      ambiente: "homologacion",
      tope_identificacion: 10000000,
    });
  });
  it("informa cada error", () => {
    const errores = validarConfiguracion({
      ...valida,
      cuit: "1",
      razonSocial: "",
      domicilio: "",
      inicioActividades: "",
      puntoVenta: "99999",
      tope: "0",
    }).errores;
    expect(errores).toMatchObject({
      cuit: "El CUIT no es válido.",
      razonSocial: "Ingresá la razón social.",
      domicilio: "Ingresá el domicilio comercial.",
      inicioActividades: "Ingresá la fecha de inicio de actividades.",
      tope: "El tope debe ser mayor a cero.",
    });
    expect(errores?.puntoVenta).toMatch(/entre 1 y 99\.998/);
  });
});
