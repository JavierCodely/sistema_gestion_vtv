import { describe, expect, it } from "vitest";
import { MENSAJE_DESACTIVADO, traducirErrorLogin } from "@/modulos/auth/lib/errores-login";

describe("traducirErrorLogin", () => {
  it("credenciales inválidas", () => {
    expect(
      traducirErrorLogin({ code: "invalid_credentials", message: "Invalid login credentials" }),
    ).toBe("Email o contraseña incorrectos.");
    expect(traducirErrorLogin({ message: "Invalid login credentials" })).toBe(
      "Email o contraseña incorrectos.",
    );
  });

  it("usuario desactivado (baneado en Auth)", () => {
    expect(traducirErrorLogin({ code: "user_banned", message: "User is banned" })).toBe(
      MENSAJE_DESACTIVADO,
    );
  });

  it("sin conexión", () => {
    expect(traducirErrorLogin({ message: "Failed to fetch" })).toMatch(/No se pudo conectar/);
  });

  it("cualquier otro error da un mensaje genérico en español", () => {
    expect(traducirErrorLogin({ message: "Something odd" })).toBe(
      "No se pudo iniciar sesión. Intentá de nuevo.",
    );
  });
});
