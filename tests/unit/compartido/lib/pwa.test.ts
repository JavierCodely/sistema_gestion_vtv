import { waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registrarServiceWorker } from "@/compartido/lib/pwa";

function simularServiceWorker(register: ReturnType<typeof vi.fn>) {
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { register },
  });
}

/** Registra y devuelve lo que se haría al terminar de cargar la página (null si no escucha). */
function registrarYCapturar(produccion: boolean): (() => void) | null {
  let alCargar: (() => void) | null = null;
  vi.spyOn(window, "addEventListener").mockImplementation((tipo, oyente) => {
    if (tipo === "load") alCargar = oyente as () => void;
  });
  registrarServiceWorker(produccion);
  return alCargar;
}

afterEach(() => {
  Reflect.deleteProperty(navigator, "serviceWorker");
  vi.restoreAllMocks();
});

describe("registrarServiceWorker", () => {
  it("en producción registra /sw.js cuando termina de cargar la página", () => {
    const register = vi.fn().mockResolvedValue({});
    simularServiceWorker(register);
    const alCargar = registrarYCapturar(true);
    expect(register).not.toHaveBeenCalled();
    alCargar?.();
    expect(register).toHaveBeenCalledWith("/sw.js");
  });

  it("en desarrollo no registra nada", () => {
    simularServiceWorker(vi.fn());
    expect(registrarYCapturar(false)).toBeNull();
  });

  it("sin soporte de service worker no hace nada", () => {
    expect(registrarYCapturar(true)).toBeNull();
  });

  it("si el registro falla lo avisa en la consola y la app sigue", async () => {
    const error = new Error("sin https");
    simularServiceWorker(vi.fn().mockRejectedValue(error));
    const consola = vi.spyOn(console, "error").mockImplementation(() => undefined);
    registrarYCapturar(true)?.();
    await waitFor(() => {
      expect(consola).toHaveBeenCalledWith("No se pudo registrar el service worker", error);
    });
  });
});
