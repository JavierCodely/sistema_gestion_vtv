import { describe, expect, it } from "vitest";
import { formatearFecha, formatearFechaHora, formatearMoneda } from "@/compartido/lib/formato";

// Intl usa espacios no separables; normalizamos para comparar.
const n = (s: string) => s.replace(/\s/g, " ");

describe("formatearMoneda", () => {
  it("formatea pesos argentinos con separador de miles y decimales", () => {
    expect(n(formatearMoneda(20000))).toBe("$ 20.000,00");
    expect(n(formatearMoneda(2000.5))).toBe("$ 2.000,50");
  });

  it("acepta strings numéricos y negativos (gastos)", () => {
    expect(n(formatearMoneda("1500"))).toBe("$ 1.500,00");
    expect(n(formatearMoneda(-1500))).toBe("-$ 1.500,00");
  });

  it("trata null, undefined y valores inválidos como cero", () => {
    expect(n(formatearMoneda(null))).toBe("$ 0,00");
    expect(n(formatearMoneda(undefined))).toBe("$ 0,00");
    expect(n(formatearMoneda("abc"))).toBe("$ 0,00");
  });
});

describe("fechas en hora argentina", () => {
  it("convierte UTC a hora de Buenos Aires (UTC-3)", () => {
    expect(n(formatearFechaHora("2026-11-19T02:30:00Z"))).toBe("18/11/2026, 23:30");
    expect(formatearFecha("2026-11-19T02:30:00Z")).toBe("18/11/2026");
  });
});
