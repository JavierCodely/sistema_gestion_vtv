import { describe, expect, it } from "vitest";
import {
  describirPresentacion,
  validarAjuste,
  validarCertificado,
  validarCompra,
  type FormularioCertificado,
} from "@/modulos/certificados/lib/validaciones";

const certificado: FormularioCertificado = {
  nombre: " Hoja VTV ",
  unidadCompra: "caja",
  hojasPorUnidad: "25",
  alcance: "global",
  destinoId: "",
  stockMinimo: "30",
};

describe("validarCertificado", () => {
  it("global: sin categoría ni servicio", () => {
    expect(validarCertificado(certificado)).toEqual({
      datos: {
        nombre: "Hoja VTV",
        unidad_compra: "caja",
        hojas_por_unidad: 25,
        alcance: "global",
        categoria_id: null,
        servicio_id: null,
        stock_minimo: 30,
      },
    });
  });

  it("categoría o servicio: exige el destino y lo pone en la columna correcta", () => {
    expect(validarCertificado({ ...certificado, alcance: "categoria" }).errores).toEqual({
      destinoId: "Elegí una categoría.",
    });
    expect(validarCertificado({ ...certificado, alcance: "servicio" }).errores).toEqual({
      destinoId: "Elegí un servicio.",
    });
    const datos = validarCertificado({ ...certificado, alcance: "servicio", destinoId: "7" }).datos;
    expect(datos).toMatchObject({ alcance: "servicio", servicio_id: 7, categoria_id: null });
  });

  it("una hoja suelta siempre tiene 1 hoja por unidad", () => {
    const datos = validarCertificado({
      ...certificado,
      unidadCompra: "unidad",
      hojasPorUnidad: "basura",
    }).datos;
    expect(datos?.hojas_por_unidad).toBe(1);
  });

  it("respeta los topes de la BD", () => {
    expect(
      validarCertificado({ ...certificado, hojasPorUnidad: "10001", stockMinimo: "1000001" })
        .errores,
    ).toEqual({
      hojasPorUnidad: "Ingresá un valor entre 1 y 10.000 en las hojas por unidad.",
      stockMinimo: "Ingresá un valor entre 0 y 1.000.000 en el stock mínimo.",
    });
  });
});

describe("validarCompra", () => {
  it("convierte los datos y deja el proveedor en null si está vacío", () => {
    expect(
      validarCompra(
        { unidades: "2", costoUnidad: "50.000", fuente: "transferencia", proveedor: "  " },
        "caja",
      ),
    ).toEqual({
      datos: { unidades: 2, costoUnidad: 50000, fuente: "transferencia", proveedor: null },
    });
  });

  it("junta los errores con el nombre de la unidad", () => {
    expect(
      validarCompra({ unidades: "", costoUnidad: "0", fuente: "", proveedor: "" }, "libreta")
        .errores,
    ).toEqual({
      unidades: "Ingresá la cantidad de libretas.",
      costoUnidad: "El costo debe ser mayor a cero.",
      fuente: "Elegí con qué se pagó.",
    });
  });
});

describe("validarAjuste", () => {
  it("el sentido define el signo", () => {
    expect(validarAjuste({ sentido: "restar", cantidad: "3", nota: " Rotura " }, 10)).toEqual({
      datos: { hojas: -3, nota: "Rotura" },
    });
    expect(validarAjuste({ sentido: "sumar", cantidad: "3", nota: "Conteo" }, 0).datos?.hojas).toBe(
      3,
    );
  });

  it("no deja restar más que el stock y exige la nota", () => {
    expect(validarAjuste({ sentido: "restar", cantidad: "11", nota: "" }, 10).errores).toEqual({
      cantidad: "No podés restar más hojas que el stock actual (10).",
      nota: "Escribí una nota.",
    });
  });

  it("muestra el stock con separador de miles", () => {
    expect(
      validarAjuste({ sentido: "restar", cantidad: "1.251", nota: "Conteo" }, 1250).errores,
    ).toEqual({ cantidad: "No podés restar más hojas que el stock actual (1.250)." });
  });
});

describe("describirPresentacion", () => {
  it("describe la unidad de compra", () => {
    expect(describirPresentacion("caja", 1000)).toBe("Caja de 1.000 hojas");
    expect(describirPresentacion("libreta", 50)).toBe("Libreta de 50 hojas");
    expect(describirPresentacion("unidad", 1)).toBe("Hoja suelta");
  });
});
