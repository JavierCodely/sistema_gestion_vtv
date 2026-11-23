import { describe, expect, it } from "vitest";
import { MONTOS_VACIOS, revisarPagoMixto } from "@/modulos/caja/lib/pago-mixto";

const montos = (cambios: Partial<typeof MONTOS_VACIOS>) => ({ ...MONTOS_VACIOS, ...cambios });

describe("revisarPagoMixto (vista previa)", () => {
  it("vacío: falta todo y pide dos medios", () => {
    expect(revisarPagoMixto(MONTOS_VACIOS, 18000)).toEqual({
      partes: [],
      errores: {},
      diferencia: 18000,
      listo: false,
      problema: "Cargá el monto de al menos dos medios de pago.",
    });
  });

  it("cierra con dos medios en formato argentino, en el orden de los medios", () => {
    const revision = revisarPagoMixto(montos({ tarjeta: "13.000", efectivo: "5000" }), 18000);
    expect(revision.partes).toEqual([
      { medio: "efectivo", monto: 5000 },
      { medio: "tarjeta", monto: 13000 },
    ]);
    expect(revision.diferencia).toBe(0);
    expect(revision.listo).toBe(true);
    expect(revision.problema).toBeNull();
  });

  it("suma en centavos (sin errores de punto flotante) con tres medios", () => {
    const revision = revisarPagoMixto(
      montos({ efectivo: "0,10", transferencia: "0,20", tarjeta: "0,30" }),
      0.6,
    );
    expect(revision.diferencia).toBe(0);
    expect(revision.listo).toBe(true);
  });

  it("dice cuánto falta o sobra", () => {
    expect(revisarPagoMixto(montos({ efectivo: "5000", tarjeta: "10000" }), 18000)).toMatchObject({
      diferencia: 3000,
      listo: false,
      problema: "Los montos no llegan al precio.",
    });
    expect(
      revisarPagoMixto(montos({ efectivo: "5000", tarjeta: "13.000,50" }), 18000),
    ).toMatchObject({ diferencia: -0.5, listo: false, problema: "Los montos superan el precio." });
  });

  it("marca los montos mal escritos con las reglas de la BD (mayor a cero, 2 decimales)", () => {
    const revision = revisarPagoMixto(
      montos({ efectivo: "0", transferencia: "1,234", tarjeta: "abc" }),
      100,
    );
    expect(revision.errores).toEqual({
      efectivo: "El monto debe ser mayor a cero.",
      transferencia: "El monto no puede tener más de 2 decimales.",
      tarjeta: "El monto no es válido.",
    });
    expect(revision.listo).toBe(false);
    expect(revision.problema).toBe("Corregí los montos marcados.");
  });
});
