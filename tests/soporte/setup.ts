import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";

// APIs del navegador que jsdom no implementa y usan los componentes de Radix (Select, Dialog).
function definirSiFalta(objetivo: object, nombre: string, valor: unknown) {
  if (!(nombre in objetivo)) {
    Object.defineProperty(objetivo, nombre, { value: valor, configurable: true, writable: true });
  }
}

class ResizeObserverDeJsdom {
  observe(): void {
    // jsdom no calcula tamaños: no hay nada que observar.
  }
  unobserve(): void {
    // Ídem.
  }
  disconnect(): void {
    // Ídem.
  }
}

definirSiFalta(Element.prototype, "hasPointerCapture", () => false);
definirSiFalta(Element.prototype, "releasePointerCapture", () => undefined);
definirSiFalta(Element.prototype, "scrollIntoView", () => undefined);
definirSiFalta(globalThis, "ResizeObserver", ResizeObserverDeJsdom);

// Las rutas con `lazy` importan módulos antes de renderizar: con la suite en paralelo
// eso puede superar el segundo por defecto de findBy*/waitFor.
configure({ asyncUtilTimeout: 3000 });

afterEach(() => {
  cleanup();
});
