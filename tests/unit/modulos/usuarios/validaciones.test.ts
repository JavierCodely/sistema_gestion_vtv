import { describe, expect, it } from "vitest";
import { hayErrores } from "@/compartido/lib/validaciones";
import { validarUsuarioNuevo } from "@/modulos/usuarios/lib/validaciones";

describe("validación de usuario nuevo", () => {
  it("usuario nuevo junta todos los errores", () => {
    const errores = validarUsuarioNuevo({ nombre: " ", email: "x", password: "1" });
    expect(Object.keys(errores).sort()).toEqual(["email", "nombre", "password"]);
    expect(hayErrores(errores)).toBe(true);
    expect(
      hayErrores(
        validarUsuarioNuevo({ nombre: "Ana", email: "ana@vtv.com", password: "12345678" }),
      ),
    ).toBe(false);
  });
});
