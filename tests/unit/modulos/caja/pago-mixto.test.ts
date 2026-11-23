import { describe, expect, it } from "vitest";
import { MEDIOS_RESTO, pagosMixtos, revisarPagoMixto } from "@/modulos/caja/lib/pago-mixto";

const normal = (texto: string | null) => (texto ?? "").replace(/\s/g, " ");

describe("revisarPagoMixto (vista previa: efectivo + resto)", () => {
  it("vacío: pide el efectivo", () => {
    expect(revisarPagoMixto("  ", 18000)).toEqual({
      efectivo: null,
      resto: null,
      error: "Escribí cuánto paga en efectivo.",
    });
  });

  it("calcula el resto en formato argentino, en centavos", () => {
    expect(revisarPagoMixto("5.000", 18000)).toEqual({ efectivo: 5000, resto: 13000, error: null });
    expect(revisarPagoMixto("0,10", 0.3)).toEqual({ efectivo: 0.1, resto: 0.2, error: null });
    expect(revisarPagoMixto("10.000,50", 30000).resto).toBe(19999.5);
  });

  it("rechaza un monto mal escrito, cero o que cubre todo el precio", () => {
    expect(revisarPagoMixto("1,2,3", 18000).error).toBe("El monto no es válido.");
    expect(revisarPagoMixto("0", 18000).error).not.toBeNull();
    for (const texto of ["18000", "20.000"]) {
      const revision = revisarPagoMixto(texto, 18000);
      expect(revision.resto).toBeNull();
      expect(normal(revision.error)).toBe(
        "El efectivo tiene que ser menor que el precio ($ 18.000,00). Si paga todo en efectivo, volvé y elegí Efectivo.",
      );
    }
  });
});

describe("pagosMixtos", () => {
  it("efectivo primero y el resto con el medio elegido", () => {
    expect(pagosMixtos(5000, 13000, "tarjeta")).toEqual([
      { medio: "efectivo", monto: 5000 },
      { medio: "tarjeta", monto: 13000 },
    ]);
    expect(MEDIOS_RESTO.map((m) => m.etiqueta)).toEqual(["Transferencia", "Débito / Crédito"]);
  });
});
