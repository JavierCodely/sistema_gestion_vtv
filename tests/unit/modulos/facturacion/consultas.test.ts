import { describe, expect, it } from "vitest";
import { convertirComprobante } from "@/modulos/facturacion/api/consultas";
import { comprobanteDePrueba } from "./datos";

describe("convertirComprobante", () => {
  it("pasa tal cual los campos que pueden faltar (sin número ni CAE todavía)", () => {
    const fila = comprobanteDePrueba({ numero: null, cae: null, fecha: null, qr_url: null });
    expect(convertirComprobante(fila)).toEqual(fila);
  });

  it("una columna obligatoria nula da un mensaje para el usuario y el detalle en `cause`", () => {
    const fila = { ...comprobanteDePrueba(), a_reconciliar: null };
    expect(() => convertirComprobante(fila)).toThrow(
      "No se pudo leer el comprobante. Recargá la página.",
    );
    try {
      convertirComprobante(fila);
    } catch (e) {
      expect(e instanceof Error && e.cause).toBe("Falta el estado de reconciliación");
    }
  });

  it("rechaza una clase desconocida", () => {
    expect(() => convertirComprobante({ ...comprobanteDePrueba(), clase: "C" })).toThrow(
      "No se pudo leer el comprobante. Recargá la página.",
    );
  });
});
