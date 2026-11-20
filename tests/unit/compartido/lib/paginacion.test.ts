import { describe, expect, it } from "vitest";
import { siguienteCursor, TAMANO_PAGINA } from "@/compartido/lib/paginacion";

const filas = (cantidad: number, desde = 1000) =>
  Array.from({ length: cantidad }, (_, i) => ({ id: desde - i }));

describe("siguienteCursor", () => {
  it("con una página completa devuelve el último id (la próxima pide id menor)", () => {
    expect(siguienteCursor(filas(TAMANO_PAGINA))).toBe(1000 - TAMANO_PAGINA + 1);
  });

  it("una página incompleta o vacía es la última", () => {
    expect(siguienteCursor(filas(TAMANO_PAGINA - 1))).toBeUndefined();
    expect(siguienteCursor([])).toBeUndefined();
  });
});
