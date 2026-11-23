import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useActualizarServicio, useCrearCategoria } from "@/modulos/servicios/api/consultas";
import { reiniciarSupabaseFalso, responder } from "@tests/soporte/supabase-falso";

vi.mock("@/compartido/lib/supabase", async () => ({
  supabase: (await import("@tests/soporte/supabase-falso")).supabaseFalso,
}));

/** Hook con un QueryClient propio y las claves que invalidó. */
function conCliente<T>(hook: () => T) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidar = vi.spyOn(queryClient, "invalidateQueries");
  const envoltorio = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(hook, { wrapper: envoltorio });
  const invalidadas = () => invalidar.mock.calls.map(([filtros]) => filtros?.queryKey);
  return { result, invalidadas };
}

beforeEach(() => {
  reiniciarSupabaseFalso();
});

describe("catálogo de servicios: invalida los descuentos", () => {
  it("crear una categoría invalida categorías, servicios y todo lo de descuentos", async () => {
    responder("categorias_servicio", "insert", { data: { id: 9, nombre: "Motos", activa: true } });
    const { result, invalidadas } = conCliente(() => useCrearCategoria());
    await act(() => result.current.mutateAsync("Motos"));
    expect(invalidadas()).toEqual(
      expect.arrayContaining([["categorias-servicio"], ["servicios"], ["descuentos"]]),
    );
  });

  it("cambiar un servicio (ej. su precio) invalida todo lo de descuentos", async () => {
    responder("servicios", "update", { data: { id: 1 } });
    const { result, invalidadas } = conCliente(() => useActualizarServicio());
    await act(() => result.current.mutateAsync({ id: 1, cambios: { precio: 31000 } }));
    expect(invalidadas()).toEqual(expect.arrayContaining([["servicios"], ["descuentos"]]));
  });
});
