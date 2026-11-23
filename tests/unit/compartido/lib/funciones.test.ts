import { FunctionsFetchError, FunctionsHttpError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@/compartido/lib/supabase", () => ({ supabase: { functions: { invoke } } }));
const { invocarFuncion } = await import("@/compartido/lib/funciones");

beforeEach(() => {
  invoke.mockReset();
});

describe("invocarFuncion", () => {
  it("envía el cuerpo y devuelve la respuesta", async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    await expect(invocarFuncion("arca", { accion: "probar_conexion" })).resolves.toEqual({
      ok: true,
    });
    expect(invoke).toHaveBeenCalledWith("arca", { body: { accion: "probar_conexion" } });
  });

  it("propaga el mensaje en español de la función", async () => {
    const respuesta = new Response(JSON.stringify({ error: "El comprobante ya está autorizado" }), {
      status: 409,
    });
    invoke.mockResolvedValue({ data: null, error: new FunctionsHttpError(respuesta) });
    await expect(invocarFuncion("arca", {})).rejects.toThrow("El comprobante ya está autorizado");
  });

  it("errores de red o sin cuerpo: mensaje genérico", async () => {
    invoke.mockResolvedValue({ data: null, error: new FunctionsFetchError({}) });
    await expect(invocarFuncion("arca", {})).rejects.toThrow(
      "No se pudo completar la operación. Intentá de nuevo.",
    );
    invoke.mockResolvedValue({ data: null, error: null });
    await expect(invocarFuncion("arca", {})).rejects.toThrow(
      "No se pudo completar la operación. Intentá de nuevo.",
    );
  });
});
