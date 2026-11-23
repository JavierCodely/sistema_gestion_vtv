import { describe, expect, it } from "vitest";
import { calcularVuelto, limpiarPatente, soloDigitos } from "@/modulos/caja/lib/vuelto";

describe("calcularVuelto", () => {
  it("resta en centavos, sin errores de punto flotante", () => {
    expect(calcularVuelto(30000, 50000)).toBe(20000);
    expect(calcularVuelto(12500.5, 13000)).toBe(499.5);
    expect(calcularVuelto(0.3, 0.1 + 0.2)).toBe(0);
  });

  it("negativo cuando no alcanza", () => {
    expect(calcularVuelto(30000, 100)).toBe(-29900);
  });
});

describe("soloDigitos", () => {
  it("deja solo números, sin ceros a la izquierda", () => {
    expect(soloDigitos("50.000,00")).toBe("5000000");
    expect(soloDigitos("$ 1a2b3")).toBe("123");
    expect(soloDigitos("007")).toBe("7");
    expect(soloDigitos("0")).toBe("0");
    expect(soloDigitos("")).toBe("");
  });
});

describe("limpiarPatente", () => {
  it("mayúsculas, solo letras y números", () => {
    expect(limpiarPatente("ab 12-3cd")).toBe("AB123CD");
    expect(limpiarPatente("aa.123.bb")).toBe("AA123BB");
  });
});
