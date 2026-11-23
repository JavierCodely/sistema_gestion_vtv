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
}

export type DatosCertificado = Required<
  Pick<
    Tablas["certificados"]["Insert"],
    "nombre" | "unidad_compra" | "hojas_por_unidad" | "stock_minimo"
  >
>;

export type ErroresCertificado = Errores<"nombre" | "hojasPorUnidad" | "stockMinimo">;

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

  if (hojas.valor === undefined || minimo.valor === undefined || Object.keys(errores).length > 0) {
    return { errores };
  }
  return {
    datos: {
      nombre: formulario.nombre.trim(),
      unidad_compra: formulario.unidadCompra,
      hojas_por_unidad: hojas.valor,
      stock_minimo: minimo.valor,
    },
  };
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
