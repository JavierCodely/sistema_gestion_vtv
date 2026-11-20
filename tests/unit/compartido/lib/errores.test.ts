import { describe, expect, it } from "vitest";
import { mensajeDeError } from "@/compartido/lib/errores";

describe("mensajeDeError", () => {
  it("usa el mensaje de Error u objetos tipo PostgrestError", () => {
    expect(mensajeDeError(new Error("La caja ya tiene un turno abierto"))).toBe(
      "La caja ya tiene un turno abierto",
    );
    expect(mensajeDeError({ message: "Saldo insuficiente", code: "P0001" })).toBe(
      "Saldo insuficiente",
    );
  });

  it("da un mensaje genérico si no hay mensaje", () => {
    expect(mensajeDeError(null)).toMatch(/inesperado/);
    expect(mensajeDeError({})).toMatch(/inesperado/);
  });
});
