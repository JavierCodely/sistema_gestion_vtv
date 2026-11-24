import {
  LARGO_MAXIMO_NOTA,
  LARGO_MAXIMO_PROVEEDOR,
  parsearEntero,
  parsearMonto,
  validarNombre,
  validarNota,
  type Errores,
} from "@/compartido/lib/validaciones";
import { formatearNumero } from "@/compartido/lib/formato";
import type { Enums, Tablas } from "@/compartido/tipos";

/** Mismos topes que la BD (migraciones 014, 018 y 019). */
export const MAXIMO_HOJAS_POR_UNIDAD = 10_000;
export const MAXIMO_STOCK_MINIMO = 1_000_000;
export const MAXIMO_UNIDADES_COMPRA = 100_000;
export const MAXIMO_HOJAS_AJUSTE = 100_000;
/** Plazo para volver de una condicional (mismo CHECK que la BD, migración 42). */
export const DIAS_VUELTA_MINIMO = 1;
export const DIAS_VUELTA_MAXIMO = 365;
export const DIAS_VUELTA_POR_DEFECTO = "30";

export type UnidadCompra = Enums["unidad_compra"];

export const UNIDADES: Record<UnidadCompra, { singular: string; plural: string }> = {
  caja: { singular: "caja", plural: "cajas" },
  libreta: { singular: "libreta", plural: "libretas" },
  unidad: { singular: "hoja suelta", plural: "hojas sueltas" },
};

/** "Caja de 25 hojas", "Hoja suelta". */
export function describirPresentacion(unidad: UnidadCompra, hojasPorUnidad: number): string {
  if (unidad === "unidad") return "Hoja suelta";
  const nombre = UNIDADES[unidad].singular;
  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} de ${formatearNumero(hojasPorUnidad)} hojas`;
}

// ---------------------------------------------------------------- Certificado

export interface FormularioCertificado {
  nombre: string;
  unidadCompra: UnidadCompra;
  hojasPorUnidad: string;
  stockMinimo: string;
  /** Certificado de condicional: la caja lo ofrece como alternativa al de siempre del servicio. */
  condicional: boolean;
  diasVuelta: string;
  /** Cuánto cuesta una unidad de compra (la libreta, la caja o la hoja); vacío = sin cargar. */
  costoUnidad: string;
}

export type DatosCertificado = Required<
  Pick<
    Tablas["certificados"]["Insert"],
    | "nombre"
    | "unidad_compra"
    | "hojas_por_unidad"
    | "stock_minimo"
    | "condicional"
    | "dias_vuelta"
    | "costo_unidad"
  >
>;

export type ErroresCertificado = Errores<
  "nombre" | "hojasPorUnidad" | "stockMinimo" | "diasVuelta" | "costoUnidad"
>;

export function validarCertificado(
  formulario: FormularioCertificado,
):
  | { errores: ErroresCertificado; datos?: undefined }
  | { errores?: undefined; datos: DatosCertificado } {
  const errores: ErroresCertificado = {};
  const nombre = validarNombre(formulario.nombre);
  if (nombre) errores.nombre = nombre;

  // Una hoja suelta siempre es 1 hoja (CHECK certificados_unidad_suelta).
  const hojas =
    formulario.unidadCompra === "unidad"
      ? { valor: 1 }
      : parsearEntero(formulario.hojasPorUnidad, {
          minimo: 1,
          maximo: MAXIMO_HOJAS_POR_UNIDAD,
          nombre: "las hojas por unidad",
        });
  if (hojas.error !== undefined) errores.hojasPorUnidad = hojas.error;

  const minimo = parsearEntero(formulario.stockMinimo, {
    minimo: 0,
    maximo: MAXIMO_STOCK_MINIMO,
    nombre: "el stock mínimo",
  });
  if (minimo.error !== undefined) errores.stockMinimo = minimo.error;

  let diasVuelta: number | null = null;
  if (formulario.condicional) {
    const dias = parsearEntero(formulario.diasVuelta, {
      minimo: DIAS_VUELTA_MINIMO,
      maximo: DIAS_VUELTA_MAXIMO,
      nombre: "los días para volver",
    });
    if (dias.error !== undefined) errores.diasVuelta = dias.error;
    else diasVuelta = dias.valor;
  }

  // Opcional; si se carga, mismas reglas que un monto (CHECK certificados_costo_unidad_valido).
  let costoUnidad: number | null = null;
  if (formulario.costoUnidad.trim() !== "") {
    const costo = parsearMonto(formulario.costoUnidad, { nombre: "costo" });
    if (costo.error !== undefined) errores.costoUnidad = costo.error;
    else costoUnidad = costo.valor;
  }

  if (hojas.valor === undefined || minimo.valor === undefined || Object.keys(errores).length > 0) {
    return { errores };
  }
  return {
    datos: {
      nombre: formulario.nombre.trim(),
      unidad_compra: formulario.unidadCompra,
      hojas_por_unidad: hojas.valor,
      stock_minimo: minimo.valor,
      condicional: formulario.condicional,
      dias_vuelta: diasVuelta,
      costo_unidad: costoUnidad,
    },
  };
}

/**
 * Vista previa del costo por hoja (la BD lo calcula al guardar: costo de la unidad / hojas, a 4
 * decimales). `undefined` si falta un dato o no es válido.
 */
export function costoPorHoja(
  costoUnidad: string,
  unidad: UnidadCompra,
  hojasPorUnidad: string,
): number | undefined {
  const costo = parsearMonto(costoUnidad, { nombre: "costo" });
  const hojas =
    unidad === "unidad"
      ? { valor: 1 }
      : parsearEntero(hojasPorUnidad, {
          minimo: 1,
          maximo: MAXIMO_HOJAS_POR_UNIDAD,
          nombre: "las hojas por unidad",
        });
  if (costo.valor === undefined || hojas.valor === undefined) return undefined;
  return Math.round((costo.valor / hojas.valor) * 10_000) / 10_000;
}

/** "Condicional · vuelve dentro de 30 días". */
export function textoCondicional(dias: number): string {
  return `Condicional · vuelve dentro de ${String(dias)} ${dias === 1 ? "día" : "días"}`;
}

// ---------------------------------------------------------------- Compra

export interface FormularioCompra {
  unidades: string;
  costoUnidad: string;
  fuente: Enums["fuente_fondos"] | "";
  proveedor: string;
}

export interface DatosCompra {
  unidades: number;
  costoUnidad: number;
  fuente: Enums["fuente_fondos"];
  proveedor: string | null;
}

export type ErroresCompra = Errores<"unidades" | "costoUnidad" | "fuente" | "proveedor">;

export function validarCompra(
  formulario: FormularioCompra,
  unidad: UnidadCompra,
): { errores: ErroresCompra; datos?: undefined } | { errores?: undefined; datos: DatosCompra } {
  const errores: ErroresCompra = {};
  const unidades = parsearEntero(formulario.unidades, {
    minimo: 1,
    maximo: MAXIMO_UNIDADES_COMPRA,
    nombre: `la cantidad de ${UNIDADES[unidad].plural}`,
  });
  if (unidades.error !== undefined) errores.unidades = unidades.error;

  const costo = parsearMonto(formulario.costoUnidad, { nombre: "costo" });
  if (costo.error !== undefined) errores.costoUnidad = costo.error;

  if (!formulario.fuente) errores.fuente = "Elegí con qué se pagó.";

  const proveedor = formulario.proveedor.trim();
  if (proveedor.length > LARGO_MAXIMO_PROVEEDOR) {
    errores.proveedor = `El proveedor no puede superar los ${LARGO_MAXIMO_PROVEEDOR} caracteres.`;
  }

  if (
    unidades.valor === undefined ||
    costo.valor === undefined ||
    !formulario.fuente ||
    Object.keys(errores).length > 0
  ) {
    return { errores };
  }
  return {
    datos: {
      unidades: unidades.valor,
      costoUnidad: costo.valor,
      fuente: formulario.fuente,
      proveedor: proveedor || null,
    },
  };
}

// ---------------------------------------------------------------- Corrección de compra

export interface FormularioCorreccion extends FormularioCompra {
  motivo: string;
}

export type ErroresCorreccion = ErroresCompra & Errores<"motivo">;

/** Misma validación que una compra nueva, más el motivo obligatorio. */
export function validarCorreccion(
  formulario: FormularioCorreccion,
  unidad: UnidadCompra,
):
  | { errores: ErroresCorreccion; datos?: undefined }
  | { errores?: undefined; datos: DatosCompra; motivo: string } {
  const compra = validarCompra(formulario, unidad);
  const motivo = formulario.motivo.trim();
  const errores: ErroresCorreccion = { ...compra.errores };
  if (!motivo) errores.motivo = "Escribí el motivo de la corrección.";
  else if (motivo.length > LARGO_MAXIMO_NOTA) {
    errores.motivo = `El motivo no puede superar los ${String(LARGO_MAXIMO_NOTA)} caracteres.`;
  }
  if (!compra.datos || errores.motivo) return { errores };
  return { datos: compra.datos, motivo };
}

// ---------------------------------------------------------------- Ajuste

export interface FormularioAjuste {
  sentido: "sumar" | "restar";
  cantidad: string;
  nota: string;
}

export interface DatosAjuste {
  /** Con signo: positivo suma, negativo resta. */
  hojas: number;
  nota: string;
}

export type ErroresAjuste = Errores<"cantidad" | "nota">;

export function validarAjuste(
  formulario: FormularioAjuste,
  stockActual: number,
): { errores: ErroresAjuste; datos?: undefined } | { errores?: undefined; datos: DatosAjuste } {
  const errores: ErroresAjuste = {};
  const cantidad = parsearEntero(formulario.cantidad, {
    minimo: 1,
    maximo: MAXIMO_HOJAS_AJUSTE,
    nombre: "la cantidad de hojas",
  });
  if (cantidad.error !== undefined) errores.cantidad = cantidad.error;
  else if (formulario.sentido === "restar" && cantidad.valor > stockActual) {
    errores.cantidad = `No podés restar más hojas que el stock actual (${formatearNumero(stockActual)}).`;
  }

  const nota = validarNota(formulario.nota);
  if (nota) errores.nota = nota;

  if (cantidad.valor === undefined || Object.keys(errores).length > 0) return { errores };
  return {
    datos: {
      hojas: formulario.sentido === "sumar" ? cantidad.valor : -cantidad.valor,
      nota: formulario.nota.trim(),
    },
  };
}
