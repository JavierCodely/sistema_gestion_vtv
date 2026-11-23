import { describe, expect, it } from "vitest";
import { siguienteCursor, siguienteCursorDe, TAMANO_PAGINA } from "@/compartido/lib/paginacion";

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

describe("siguienteCursorDe", () => {
  const libro = (cantidad: number) =>
    Array.from({ length: cantidad }, (_, i) => ({
      fecha: `2026-11-22T10:00:00.${String(100000 + i)}+00:00`,
      clave: `venta:${String(i)}`,
    }));

  it("con una página completa arma el cursor de la última fila", () => {
    const pagina = libro(TAMANO_PAGINA);
    const ultima = pagina[pagina.length - 1];
    expect(siguienteCursorDe(pagina, ({ fecha, clave }) => ({ fecha, clave }))).toEqual({
      fecha: ultima?.fecha,
      clave: ultima?.clave,
    });
  });

  it("una página incompleta es la última", () => {
    expect(siguienteCursorDe(libro(3), (f) => f.clave)).toBeUndefined();
  });
});
