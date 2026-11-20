import { describe, expect, it } from "vitest";
import {
  formatearCuit,
  formatearDocumento,
  nombreComprobante,
  numeroComprobante,
} from "@/modulos/facturacion/lib/formato";

describe("formato de comprobantes", () => {
  it("nombre por código de ARCA", () => {
    expect(nombreComprobante(1)).toBe("Factura A");
    expect(nombreComprobante(8)).toBe("Nota de crédito B");
    expect(nombreComprobante(11)).toBe("Comprobante 11");
  });
  it("número con punto de venta", () => {
    expect(numeroComprobante(3, 41)).toBe("00003-00000041");
    expect(numeroComprobante(3, null)).toBe("00003-(sin número)");
  });
  it("CUIT y documentos", () => {
    expect(formatearCuit("30712345671")).toBe("30-71234567-1");
    expect(formatearDocumento(80, 30712345671)).toBe("CUIT 30-71234567-1");
    expect(formatearDocumento(96, 30111222)).toBe("DNI 30.111.222");
    expect(formatearDocumento(99, 0)).toBe("—");
  });
});
