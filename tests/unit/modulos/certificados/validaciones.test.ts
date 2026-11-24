import { describe, expect, it } from "vitest";
import {
  costoPorHoja,
  describirPresentacion,
  textoCondicional,
  validarAjuste,
  validarCertificado,
  validarCompra,
  validarCorreccion,
  type FormularioCertificado,
} from "@/modulos/certificados/lib/validaciones";

const certificado: FormularioCertificado = {
  nombre: " Hoja VTV ",
  unidadCompra: "caja",
  hojasPorUnidad: "25",
  stockMinimo: "30",
  condicional: false,
  diasVuelta: "30",
  costoUnidad: "",
};

describe("validarCertificado", () => {
  it("arma los datos de la tabla (los destinos se fijan aparte)", () => {
    expect(validarCertificado(certificado)).toEqual({
      datos: {
        nombre: "Hoja VTV",
        unidad_compra: "caja",
        hojas_por_unidad: 25,
        stock_minimo: 30,
        condicional: false,
        dias_vuelta: null,
        costo_unidad: null,
      },
    });
  });

  it("el costo de la unidad es opcional y se valida como un monto", () => {
    expect(validarCertificado({ ...certificado, costoUnidad: "3.700" }).datos?.costo_unidad).toBe(
      3700,
    );
    expect(
      validarCertificado({ ...certificado, costoUnidad: "  " }).datos?.costo_unidad,
    ).toBeNull();
    expect(validarCertificado({ ...certificado, costoUnidad: "0" }).errores).toHaveProperty(
      "costoUnidad",
    );
    expect(validarCertificado({ ...certificado, costoUnidad: "abc" }).errores).toHaveProperty(
      "costoUnidad",
    );
  });

  it("costoPorHoja: libreta de 25 hojas a $ 3.700 → $ 148 la hoja", () => {
    expect(costoPorHoja("3.700", "libreta", "25")).toBe(148);
    expect(costoPorHoja("1.000", "caja", "3")).toBe(333.3333);
    expect(costoPorHoja("250,50", "unidad", "")).toBe(250.5);
    expect(costoPorHoja("", "libreta", "25")).toBeUndefined();
    expect(costoPorHoja("3.700", "libreta", "0")).toBeUndefined();
  });

  it("un certificado condicional lleva los días para volver (1 a 365)", () => {
    expect(validarCertificado({ ...certificado, condicional: true }).datos).toMatchObject({
      condicional: true,
      dias_vuelta: 30,
    });
    expect(
      validarCertificado({ ...certificado, condicional: true, diasVuelta: "0" }).errores,
    ).toHaveProperty("diasVuelta");
    expect(
      validarCertificado({ ...certificado, condicional: true, diasVuelta: "366" }).errores,
    ).toHaveProperty("diasVuelta");
    expect(
      validarCertificado({ ...certificado, condicional: true, diasVuelta: "" }).errores,
    ).toHaveProperty("diasVuelta");
  });

  it("los días no se guardan si no es condicional", () => {
    expect(
      validarCertificado({ ...certificado, diasVuelta: "basura" }).datos?.dias_vuelta,
    ).toBeNull();
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

describe("validarCorreccion", () => {
  const base = { unidades: "3", costoUnidad: "1.500", fuente: "efectivo" as const, proveedor: "" };

  it("valida como una compra y exige el motivo", () => {
    expect(validarCorreccion({ ...base, unidades: "", motivo: " " }, "caja").errores).toEqual({
      unidades: "Ingresá la cantidad de cajas.",
      motivo: "Escribí el motivo de la corrección.",
    });
    expect(validarCorreccion({ ...base, motivo: "x".repeat(501) }, "caja").errores).toEqual({
      motivo: "El motivo no puede superar los 500 caracteres.",
    });
  });

  it("devuelve los datos de la compra y el motivo sin espacios", () => {
    expect(validarCorreccion({ ...base, motivo: " Error de carga " }, "caja")).toEqual({
      datos: { unidades: 3, costoUnidad: 1500, fuente: "efectivo", proveedor: null },
      motivo: "Error de carga",
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

describe("textoCondicional", () => {
  it("dice el plazo en días", () => {
    expect(textoCondicional(30)).toBe("Condicional · vuelve dentro de 30 días");
    expect(textoCondicional(1)).toBe("Condicional · vuelve dentro de 1 día");
  });
});

describe("describirPresentacion", () => {
  it("describe la unidad de compra", () => {
    expect(describirPresentacion("caja", 1000)).toBe("Caja de 1.000 hojas");
    expect(describirPresentacion("libreta", 50)).toBe("Libreta de 50 hojas");
    expect(describirPresentacion("unidad", 1)).toBe("Hoja suelta");
  });
});
