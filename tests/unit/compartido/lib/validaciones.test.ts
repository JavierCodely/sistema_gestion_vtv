import { describe, expect, it } from "vitest";
import {
  LARGO_MAXIMO_PATENTE,
  montoComoTexto,
  normalizarPatente,
  parsearEntero,
  validarNota,
  parsearMonto,
  validarEmail,
  validarNombre,
  validarPassword,
} from "@/compartido/lib/validaciones";

describe("validaciones", () => {
  it("email", () => {
    expect(validarEmail("")).toBe("Ingresá el email.");
    expect(validarEmail("ana@")).toBe("El email no es válido.");
    expect(validarEmail(" ana@vtv.com ")).toBeUndefined();
  });

  it("contraseña: largo mínimo y confirmación", () => {
    expect(validarPassword("1234567")).toMatch(/al menos 8/);
    expect(validarPassword("12345678", "12345679")).toBe("Las contraseñas no coinciden.");
    expect(validarPassword("12345678", "12345678")).toBeUndefined();
  });

  it("límites de largo iguales a los de la base de datos", () => {
    expect(validarNombre("x".repeat(101))).toMatch(/100 caracteres/);
    expect(validarNombre("x".repeat(100))).toBeUndefined();
    expect(validarPassword("x".repeat(73))).toMatch(/72 caracteres/);
    expect(validarEmail(`${"x".repeat(250)}@a.com`)).toBe("El email es demasiado largo.");
  });
});

describe("parsearMonto", () => {
  it.each([
    ["20000", 20000],
    ["20.000", 20000],
    ["1.234.567,8", 1234567.8],
    ["20000,50", 20000.5],
    ["20.000,50", 20000.5],
    ["20000.5", 20000.5],
    ["$ 1500", 1500],
    [" 0,01 ", 0.01],
  ])("acepta %s", (texto, valor) => {
    expect(parsearMonto(texto)).toEqual({ valor });
  });

  it.each([
    ["", "Ingresá un monto."],
    ["abc", "El monto no es válido."],
    ["-5", "El monto no es válido."],
    ["1,2,3", "El monto no es válido."],
    ["20.00,5", "El monto no es válido."],
    ["NaN", "El monto no es válido."],
    ["1e5", "El monto no es válido."],
    ["10,123", "El monto no puede tener más de 2 decimales."],
    ["0", "El monto debe ser mayor a cero."],
    ["10000000000", "El monto es demasiado grande."],
  ])("rechaza %j", (texto, error) => {
    expect(parsearMonto(texto)).toEqual({ error });
  });

  it("los mensajes usan el nombre del campo", () => {
    expect(parsearMonto("", { nombre: "precio" })).toEqual({ error: "Ingresá un precio." });
    expect(parsearMonto("x", { nombre: "costo" })).toEqual({ error: "El costo no es válido." });
  });

  it("el cero se permite solo si se pide (ej. precio de una reverificación)", () => {
    expect(parsearMonto("0", { permitirCero: true })).toEqual({ valor: 0 });
  });

  it("montoComoTexto es la inversa para precargar formularios", () => {
    expect(montoComoTexto(20000)).toBe("20000");
    expect(montoComoTexto(1500.5)).toBe("1500,50");
    expect(parsearMonto(montoComoTexto(1500.5))).toEqual({ valor: 1500.5 });
  });
});

describe("parsearEntero", () => {
  const opciones = { minimo: 1, maximo: 100000, nombre: "la cantidad" };
  it.each([
    ["5", 5],
    [" 1.000 ", 1000],
    ["100.000", 100000],
    ["100000", 100000],
  ])("acepta %j", (texto, valor) => {
    expect(parsearEntero(texto, opciones)).toEqual({ valor });
  });
  it.each([
    ["", "Ingresá la cantidad."],
    ["2,5", "Ingresá un número entero en la cantidad."],
    ["-1", "Ingresá un número entero en la cantidad."],
    ["2.5", "Ingresá un número entero en la cantidad."],
    ["1.0.0", "Ingresá un número entero en la cantidad."],
    ["10.00", "Ingresá un número entero en la cantidad."],
    ["0", "Ingresá un valor entre 1 y 100.000 en la cantidad."],
    ["100001", "Ingresá un valor entre 1 y 100.000 en la cantidad."],
  ])("rechaza %j", (texto, error) => {
    expect(parsearEntero(texto, opciones)).toEqual({ error });
  });
});

describe("validarNota", () => {
  it("es obligatoria y con el largo de la BD", () => {
    expect(validarNota("  ")).toBe("Escribí una nota.");
    expect(validarNota("x".repeat(501))).toMatch(/500 caracteres/);
    expect(validarNota("Rotura")).toBeUndefined();
  });
});

describe("normalizarPatente", () => {
  it("saca espacios y pasa a mayúsculas, como la BD", () => {
    expect(normalizarPatente(" ab 123\tcd ")).toBe("AB123CD");
    expect(LARGO_MAXIMO_PATENTE).toBe(10);
  });
});
