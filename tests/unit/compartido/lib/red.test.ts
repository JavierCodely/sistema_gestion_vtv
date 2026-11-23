import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { MENSAJES_ERROR, mensajeDeError } from "@/compartido/lib/errores";
import { fetchConLimite } from "@/compartido/lib/red";

/** Conexión que nunca responde (como un proxy que descarta la respuesta): solo termina si la abortan. */
const colgado = vi.fn<typeof fetch>(
  (_entrada, init) =>
    new Promise<Response>((_resolver, rechazar) => {
      init?.signal?.addEventListener("abort", () => {
        const motivo: unknown = init.signal?.reason;
        rechazar(motivo instanceof Error ? motivo : new Error("abortado"));
      });
    }),
);

describe("fetchConLimite", () => {
  it("un pedido sin respuesta falla al vencer el límite", async () => {
    const f = fetchConLimite({ base: colgado, pedidoMs: 20, funcionMs: 5_000 });
    await expect(f("http://127.0.0.1:54321/rest/v1/cajas")).rejects.toMatchObject({
      name: "TimeoutError",
    });
  });

  it("las Edge Functions tienen su propio límite, más largo", async () => {
    const f = fetchConLimite({ base: colgado, pedidoMs: 20, funcionMs: 80 });
    const inicio = Date.now();
    await expect(f(new URL("http://127.0.0.1:54321/functions/v1/arca"))).rejects.toMatchObject({
      name: "TimeoutError",
    });
    expect(Date.now() - inicio).toBeGreaterThanOrEqual(70);
  });

  it("respeta el signal propio del pedido (cancelación de TanStack Query)", async () => {
    const f = fetchConLimite({ base: colgado, pedidoMs: 5_000 });
    const control = new AbortController();
    const pedido = f("http://127.0.0.1:54321/rest/v1/cajas", { signal: control.signal });
    control.abort();
    await expect(pedido).rejects.toMatchObject({ name: "AbortError" });
  });

  it("una respuesta a tiempo pasa sin cambios", async () => {
    const respuesta = new Response("[]", { status: 200 });
    const f = fetchConLimite({ base: () => Promise.resolve(respuesta) });
    await expect(f("http://127.0.0.1:54321/rest/v1/cajas")).resolves.toBe(respuesta);
  });

  it("con supabase-js: la lectura colgada se reintenta y termina en un error legible", async () => {
    colgado.mockClear();
    const cliente = createClient("http://127.0.0.1:54321", "clave", {
      global: { fetch: fetchConLimite({ base: colgado, pedidoMs: 20 }) },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await cliente.from("cajas").select("id");
    // postgrest-js reintenta la lectura 3 veces (esperas de 1, 2 y 4 s) antes de devolver el error
    expect(colgado).toHaveBeenCalledTimes(4);
    expect(mensajeDeError(error)).toBe(MENSAJES_ERROR.demora);
  }, 15_000);

  it("con supabase-js: una escritura colgada no se reintenta (el servidor pudo aplicarla)", async () => {
    colgado.mockClear();
    const cliente = createClient("http://127.0.0.1:54321", "clave", {
      global: { fetch: fetchConLimite({ base: colgado, pedidoMs: 20 }) },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await cliente.rpc("abrir_turno", { p_caja_id: 1 });
    expect(colgado).toHaveBeenCalledTimes(1);
    expect(mensajeDeError(error)).toBe(MENSAJES_ERROR.demora);
  });
});
