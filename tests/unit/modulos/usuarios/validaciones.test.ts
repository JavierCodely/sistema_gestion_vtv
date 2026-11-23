import { describe, expect, it } from "vitest";
import { hayErrores } from "@/compartido/lib/validaciones";
import { validarApellido, validarUsuarioNuevo } from "@/modulos/usuarios/lib/validaciones";

describe("validación de usuario nuevo", () => {
  it("usuario nuevo junta todos los errores", () => {
    const errores = validarUsuarioNuevo({ nombre: " ", apellido: "", email: "x", password: "1" });
    expect(Object.keys(errores).sort()).toEqual(["apellido", "email", "nombre", "password"]);
    expect(hayErrores(errores)).toBe(true);
    expect(
      hayErrores(
        validarUsuarioNuevo({
          nombre: "Ana",
          apellido: "Pérez",
          email: "ana@vtv.com",
          password: "12345678",
        }),
      ),
    ).toBe(false);
  });

  it("el apellido es obligatorio y tiene el mismo tope que en la base (100)", () => {
    expect(validarApellido("  ")).toBe("Ingresá el apellido.");
    expect(validarApellido("x".repeat(101))).toBe(
      "El apellido no puede superar los 100 caracteres.",
    );
    expect(validarApellido("Pérez Gómez")).toBeUndefined();
  });
});
