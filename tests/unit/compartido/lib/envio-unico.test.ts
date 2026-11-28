import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useEnvioUnico } from "@/compartido/lib/envio-unico";

describe("useEnvioUnico", () => {
  it("ignora un segundo envío mientras el primero sigue en curso", async () => {
    const { result } = renderHook(() => useEnvioUnico());
    let llamadas = 0;
    let terminar = () => {};
    const accion = () =>
      new Promise<void>((resolve) => {
        llamadas++;
        terminar = resolve;
      });
    let primero: Promise<void> = Promise.resolve();
    act(() => {
      primero = result.current(accion);
      void result.current(accion);
    });
    expect(llamadas).toBe(1);
    terminar();
    await act(() => primero);
    // Terminado, se puede volver a enviar.
    act(() => void result.current(accion));
    expect(llamadas).toBe(2);
  });

  it("suelta el candado si el envío falla, para poder corregir y reintentar", async () => {
    const { result } = renderHook(() => useEnvioUnico());
    let llamadas = 0;
    await act(async () => {
      await result
        .current(() => {
          llamadas++;
          return Promise.reject(new Error("falló"));
        })
        .catch(() => {});
    });
    await act(() => result.current(() => Promise.resolve(void llamadas++)));
    expect(llamadas).toBe(2);
  });
});
