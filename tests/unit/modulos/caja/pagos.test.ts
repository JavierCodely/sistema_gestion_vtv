import { describe, expect, it } from "vitest";
import { describirMedio, detallePagos, parteEnEfectivo } from "@/modulos/caja/lib/pagos";

const normal = (texto: string | null) => (texto ?? "").replace(/\s/g, " ");

describe("medio de una venta en las listas", () => {
  it("un solo medio se muestra tal cual, sin detalle", () => {
    expect(
      describirMedio({
        medio_pago: "transferencia",
        venta_pagos: [{ medio: "transferencia", monto: 18000 }],
      }),
    ).toEqual({ etiqueta: "Transferencia", detalle: null });
  });

  it("un pago mixto es “Mixto” con el detalle por medio, en orden", () => {
    const { etiqueta, detalle } = describirMedio({
      medio_pago: null,
      venta_pagos: [
        { medio: "transferencia", monto: 13000 },
        { medio: "efectivo", monto: 5000 },
      ],
    });
    expect(etiqueta).toBe("Mixto");
    expect(normal(detalle)).toBe("Efectivo $ 5.000,00 + Transferencia $ 13.000,00");
  });

  it("detalle en orden de los medios y la parte en efectivo", () => {
    const pagos = [
      { medio: "transferencia" as const, monto: 2 },
      { medio: "efectivo" as const, monto: 3.5 },
    ];
    expect(normal(detallePagos(pagos))).toBe("Efectivo $ 3,50 + Transferencia $ 2,00");
    expect(parteEnEfectivo({ venta_pagos: pagos })).toBe(3.5);
    expect(parteEnEfectivo({ venta_pagos: [{ medio: "transferencia", monto: 1 }] })).toBe(0);
  });
});
