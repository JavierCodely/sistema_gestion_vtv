import { describe, expect, it } from "vitest";
import { MENSAJES_ERROR, mensajeDeError } from "@/compartido/lib/errores";

describe("mensajeDeError", () => {
  it("muestra tal cual los mensajes de nuestras RPC (P0001, 22023, 42501)", () => {
    expect(mensajeDeError({ code: "P0001", message: "Saldo insuficiente" })).toBe(
      "Saldo insuficiente",
    );
    expect(mensajeDeError({ code: "22023", message: "Elegí un medio de pago" })).toBe(
      "Elegí un medio de pago",
    );
    expect(mensajeDeError({ code: "42501", message: "Solo un administrador puede hacerlo" })).toBe(
      "Solo un administrador puede hacerlo",
    );
  });

  it("muestra tal cual los errores sin código (app y Edge Function)", () => {
    expect(mensajeDeError(new Error("La caja ya tiene un turno abierto"))).toBe(
      "La caja ya tiene un turno abierto",
    );
  });

  it("da un mensaje genérico si no hay mensaje", () => {
    expect(mensajeDeError(null)).toBe(MENSAJES_ERROR.inesperado);
    expect(mensajeDeError({})).toBe(MENSAJES_ERROR.inesperado);
    expect(mensajeDeError("texto suelto")).toBe(MENSAJES_ERROR.inesperado);
  });

  it.each([
    ["23505", 'duplicate key value violates unique constraint "x"', MENSAJES_ERROR.repetido],
    ["23503", "violates foreign key constraint", MENSAJES_ERROR.enUso],
    ["23514", "violates check constraint", MENSAJES_ERROR.invalido],
    ["22P02", "invalid input syntax for type bigint", MENSAJES_ERROR.invalido],
    [
      "PGRST116",
      "JSON object requested, multiple (or no) rows returned",
      MENSAJES_ERROR.noEncontrado,
    ],
    ["PGRST301", "JWT expired", MENSAJES_ERROR.sesionVencida],
    ["PGRST303", "JWT expired", MENSAJES_ERROR.sesionVencida],
    ["57014", "canceling statement due to statement timeout", MENSAJES_ERROR.demora],
    ["42501", "permission denied for table cajas", MENSAJES_ERROR.sinPermiso],
    ["42501", "new row violates row-level security policy", MENSAJES_ERROR.sinPermiso],
    ["42P01", 'relation "x" does not exist', MENSAJES_ERROR.inesperado],
    ["PGRST204", "Could not find the column", MENSAJES_ERROR.inesperado],
  ])("traduce %s (%s)", (code, message, esperado) => {
    expect(mensajeDeError({ code, message })).toBe(esperado);
  });

  it.each(["TypeError: Failed to fetch", "NetworkError when attempting to fetch", "Load failed"])(
    "red caída: %s",
    (message) => {
      expect(mensajeDeError(new TypeError(message))).toBe(MENSAJES_ERROR.conexion);
      expect(mensajeDeError({ code: "", message })).toBe(MENSAJES_ERROR.conexion);
    },
  );

  it("acepta mensajes específicos por pantalla", () => {
    const opciones = { repetido: "Ya existe esa caja", enUso: "La caja ya se usó" };
    expect(mensajeDeError({ code: "23505", message: "duplicate" }, opciones)).toBe(
      "Ya existe esa caja",
    );
    expect(mensajeDeError({ code: "23503", message: "fk" }, opciones)).toBe("La caja ya se usó");
  });
});
