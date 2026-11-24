import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  esTurnoNoDisponible,
  useAbrirTurno,
  useCerrarTurno,
  useRegistrarVenta,
} from "@/modulos/caja/api/consultas";
import { argumentosRpc, reiniciarSupabaseFalso, responderRpc } from "@tests/soporte/supabase-falso";

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

const VENTA = {
  turnoId: 5,
  servicioId: 1,
  cobro: { medio: "tarjeta" as const },
  patente: null,
  descuentoId: null,
  precioEsperado: 30000,
  condicional: false,
  condicionalMitad: false,
};

beforeEach(() => {
  reiniciarSupabaseFalso();
});

describe("useRegistrarVenta: lo que vuelve a leer", () => {
  const CATALOGO_DE_VENTA = [
    ["servicios"],
    ["categorias-servicio"],
    ["descuentos", "para-servicio"],
  ];

  it("tras una venta: caja, turnos, stock, efectivo, estadísticas y el catálogo de venta", async () => {
    responderRpc("registrar_venta", { data: { id: 1 } });
    const { result, invalidadas } = conCliente(() => useRegistrarVenta());
    await act(() => result.current.mutateAsync(VENTA));
    // La venta va al turno de la caja elegida.
    expect(argumentosRpc("registrar_venta")).toEqual({
      p_turno_id: 5,
      p_servicio_id: 1,
      p_medio_pago: "tarjeta",
      p_precio_esperado: 30000,
    });
    expect(invalidadas()).toEqual(
      expect.arrayContaining([
        ["caja"],
        ["turnos"],
        ["certificados"],
        ["efectivo"],
        ["descuentos", "resumen"],
        ...CATALOGO_DE_VENTA,
      ]),
    );
  });

  it("tras un rechazo (ej. precio cambiado) también relee el catálogo y los descuentos", async () => {
    responderRpc("registrar_venta", {
      error: { code: "P0001", message: "El precio cambió: ahora es $ 31.000,00. Revisá la venta." },
    });
    const { result, invalidadas } = conCliente(() => useRegistrarVenta());
    await act(() => expect(result.current.mutateAsync(VENTA)).rejects.toBeTruthy());
    expect(invalidadas()).toEqual(expect.arrayContaining([["caja"], ...CATALOGO_DE_VENTA]));
  });
});

describe("abrir y cerrar turno: lo que vuelven a leer", () => {
  // ["turnos"] cubre v_turnos, los turnos abiertos y las cajas abiertas de /caja; ["caja"], las cajas
  // para turno y el historial; ["efectivo"], la caja de cambio.
  const TURNOS_Y_EFECTIVO = [["caja"], ["turnos"], ["efectivo"]];

  it("abrir manda caja y efectivo inicial (sin usuario) e invalida turnos, cajas y efectivo", async () => {
    responderRpc("abrir_turno", { data: { id: 9 } });
    const { result, invalidadas } = conCliente(() => useAbrirTurno());
    await act(() => result.current.mutateAsync({ cajaId: 2, efectivoInicial: 1000 }));
    expect(argumentosRpc("abrir_turno")).toEqual({ p_caja_id: 2, p_efectivo_inicial: 1000 });
    expect(invalidadas()).toEqual(expect.arrayContaining(TURNOS_Y_EFECTIVO));
  });

  it("cerrar manda el turno y las observaciones e invalida turnos, cajas y efectivo", async () => {
    responderRpc("cerrar_turno", { data: { id: 9 } });
    const { result, invalidadas } = conCliente(() => useCerrarTurno());
    await act(() => result.current.mutateAsync({ turnoId: 9, observaciones: "Todo bien" }));
    expect(argumentosRpc("cerrar_turno")).toEqual({ p_turno_id: 9, p_observaciones: "Todo bien" });
    expect(invalidadas()).toEqual(expect.arrayContaining(TURNOS_Y_EFECTIVO));
  });
});

describe("esTurnoNoDisponible", () => {
  it("reconoce los rechazos por caja cerrada o turno inexistente", () => {
    expect(
      esTurnoNoDisponible({
        code: "P0001",
        message: 'El turno de la caja "Caja 1" ya se cerró: elegí una caja abierta',
      }),
    ).toBe(true);
    expect(esTurnoNoDisponible({ code: "22023", message: "El turno elegido no existe" })).toBe(
      true,
    );
    expect(esTurnoNoDisponible({ code: "P0001", message: "El precio cambió" })).toBe(false);
    expect(esTurnoNoDisponible(null)).toBe(false);
  });
});
