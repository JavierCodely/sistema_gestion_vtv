import { FunctionsHttpError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@/compartido/lib/supabase", () => ({ supabase: { functions: { invoke } } }));
const { llamarAdminUsuarios } = await import("@/modulos/usuarios/api/admin-usuarios");

const usuario = { id: "u1", nombre: "Ana", email: "ana@vtv.com", rol: "cajero", activo: true };

describe("llamarAdminUsuarios", () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it("envía la acción y devuelve el usuario", async () => {
    invoke.mockResolvedValue({ data: { usuario }, error: null });
    const accion = { accion: "activar", id: "u1", activo: true } as const;
    await expect(llamarAdminUsuarios(accion)).resolves.toEqual(usuario);
    expect(invoke).toHaveBeenCalledWith("admin-usuarios", { body: accion });
  });

  it("propaga el mensaje en español que devuelve la función", async () => {
    const respuesta = new Response(
      JSON.stringify({ error: "Ya existe un usuario con ese email" }),
      {
        status: 400,
      },
    );
    invoke.mockResolvedValue({ data: null, error: new FunctionsHttpError(respuesta) });
    await expect(
      llamarAdminUsuarios({ accion: "cambiar_password", id: "u1", password: "12345678" }),
    ).rejects.toThrow("Ya existe un usuario con ese email");
  });

  it("si la respuesta no trae mensaje usa uno genérico", async () => {
    invoke.mockResolvedValue({ data: null, error: new Error("boom") });
    await expect(
      llamarAdminUsuarios({ accion: "activar", id: "u1", activo: false }),
    ).rejects.toThrow("No se pudo completar la operación. Intentá de nuevo.");
  });
});
