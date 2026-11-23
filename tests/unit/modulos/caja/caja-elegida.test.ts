import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  aEleccion,
  cajaInicial,
  CLAVE_CAJA_ELEGIDA,
  estadoEleccion,
  guardarCajaElegida,
  leerCajaGuardada,
} from "@/modulos/caja/lib/caja-elegida";

const CAJA_1 = { id: 5, caja_id: 1, caja_nombre: "Caja 1", abierto_en: "2026-11-20T12:00:00Z" };
const CAJA_2 = { id: 8, caja_id: 2, caja_nombre: "Caja 2", abierto_en: "2026-11-20T13:00:00Z" };

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("cajaInicial", () => {
  it("una sola caja abierta: queda elegida", () => {
    expect(cajaInicial([CAJA_1], null)).toBe(CAJA_1);
  });

  it("varias: la recordada si sigue abierta; si no, ninguna (elige el usuario)", () => {
    expect(cajaInicial([CAJA_1, CAJA_2], 2)).toBe(CAJA_2);
    expect(cajaInicial([CAJA_1, CAJA_2], 9)).toBeNull();
    expect(cajaInicial([CAJA_1, CAJA_2], null)).toBeNull();
  });

  it("ninguna abierta: ninguna", () => {
    expect(cajaInicial([], 1)).toBeNull();
  });
});

describe("estadoEleccion", () => {
  it("sin elección: eligiendo, sin aviso", () => {
    expect(estadoEleccion([CAJA_1, CAJA_2], null)).toEqual({ tipo: "eligiendo", aviso: null });
  });

  it("con la caja abierta: trabajando en ella (los datos al día de la lista)", () => {
    const actualizada = { ...CAJA_2, caja_nombre: "Caja Dos" };
    expect(estadoEleccion([CAJA_1, actualizada], aEleccion(CAJA_2))).toEqual({
      tipo: "trabajando",
      caja: actualizada,
    });
  });

  it("si su turno se cerró: eligiendo con aviso, sin pasar sola a otra caja", () => {
    expect(estadoEleccion([CAJA_1], aEleccion(CAJA_2))).toEqual({
      tipo: "eligiendo",
      aviso: "El turno de la caja “Caja 2” se cerró: elegí una caja abierta.",
    });
  });

  it("si la venta la rechazó: eligiendo con el mensaje, aunque la lista todavía la muestre", () => {
    expect(estadoEleccion([CAJA_1], { ...aEleccion(CAJA_1), aviso: "Ya se cerró" })).toEqual({
      tipo: "eligiendo",
      aviso: "Ya se cerró",
    });
  });
});

describe("caja recordada en localStorage", () => {
  it("guarda y lee el id de la caja", () => {
    guardarCajaElegida(3);
    expect(localStorage.getItem(CLAVE_CAJA_ELEGIDA)).toBe("3");
    expect(leerCajaGuardada()).toBe(3);
  });

  it("un valor inválido o ausente es 'ninguna'", () => {
    expect(leerCajaGuardada()).toBeNull();
    localStorage.setItem(CLAVE_CAJA_ELEGIDA, "abc");
    expect(leerCajaGuardada()).toBeNull();
    localStorage.setItem(CLAVE_CAJA_ELEGIDA, "-1");
    expect(leerCajaGuardada()).toBeNull();
  });

  it("sin localStorage disponible no falla (es solo comodidad)", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    expect(() => {
      guardarCajaElegida(3);
    }).not.toThrow();
    expect(leerCajaGuardada()).toBeNull();
  });
});
