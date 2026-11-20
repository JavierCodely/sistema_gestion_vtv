import { describe, expect, it } from "vitest";
import { validarEmail, validarNombre, validarPassword } from "@/compartido/lib/validaciones";

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
