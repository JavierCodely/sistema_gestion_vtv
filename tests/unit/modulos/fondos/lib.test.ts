import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  descripcionMovimiento,
  esReverso,
  nombreMovimiento,
  nombreOrigen,
} from "@/modulos/fondos/lib/fondos";
import {
  CLAVE_PESTANA,
  guardarPestana,
  leerPestanaGuardada,
  pestanaInicial,
} from "@/modulos/fondos/lib/pestanas";
import { validarMovimiento } from "@/modulos/fondos/lib/validaciones";

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("nombres del libro de Fondos", () => {
  it("origen legible; uno desconocido se muestra tal cual", () => {
    expect(nombreOrigen("venta")).toBe("Venta");
    expect(nombreOrigen("venta_anulada")).toBe("Venta anulada");
    expect(nombreOrigen("compra")).toBe("Compra");
    expect(nombreOrigen("manual")).toBe("Manual");
    expect(nombreOrigen("cierre_turno")).toBe("Cierre de turno");
    expect(nombreOrigen("otro")).toBe("otro");
  });

  it("marca como reverso solo las anulaciones", () => {
    expect(esReverso("venta_anulada")).toBe(true);
    expect(esReverso("gasto_anulado")).toBe(true);
    expect(esReverso("compra_anulada")).toBe(true);
    expect(esReverso("venta")).toBe(false);
    expect(esReverso("manual")).toBe(false);
  });

  it("movimientos manuales: fondo inicial en efectivo, saldo inicial en las otras cuentas", () => {
    expect(nombreMovimiento("efectivo", "fondo_inicial")).toBe("Fondo inicial");
    expect(nombreMovimiento("transferencia", "fondo_inicial")).toBe("Saldo inicial");
    expect(nombreMovimiento("tarjeta", "retiro")).toBe("Retiro");
    expect(descripcionMovimiento("transferencia", "retiro")).toContain(
      "no puede quedar en negativo",
    );
    expect(descripcionMovimiento("efectivo", "ingreso")).toContain("la caja de cambio");
  });
});

describe("pestaña de Fondos", () => {
  it("la de la URL gana; si no, la guardada; si no, Efectivo", () => {
    expect(pestanaInicial(null)).toBe("efectivo");
    guardarPestana("mixto");
    expect(localStorage.getItem(CLAVE_PESTANA)).toBe("mixto");
    expect(pestanaInicial(null)).toBe("mixto");
    expect(pestanaInicial("tarjeta")).toBe("tarjeta");
    expect(pestanaInicial("cualquiera")).toBe("mixto");
  });

  it("ignora un valor guardado inválido", () => {
    localStorage.setItem(CLAVE_PESTANA, "caja");
    expect(leerPestanaGuardada()).toBeNull();
  });

  it("sin localStorage disponible no se rompe", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    expect(() => {
      guardarPestana("transferencia");
    }).not.toThrow();
    expect(leerPestanaGuardada()).toBeNull();
    expect(pestanaInicial(null)).toBe("efectivo");
  });
});

describe("validarMovimiento", () => {
  it("exige monto válido y nota", () => {
    expect(validarMovimiento({ monto: "", nota: "" }).errores).toEqual({
      monto: "Ingresá un monto.",
      nota: "Escribí una nota.",
    });
    expect(validarMovimiento({ monto: "1.500,25", nota: " Cambio " })).toEqual({
      datos: { monto: 1500.25, nota: "Cambio" },
    });
  });

  it("rechaza una nota de más de 500 caracteres", () => {
    expect(validarMovimiento({ monto: "10", nota: "a".repeat(501) }).errores?.nota).toBeTruthy();
  });
});
