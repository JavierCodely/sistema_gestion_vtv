import { formatearMoneda } from "@/compartido/lib/formato";
import { parsearMonto } from "@/compartido/lib/validaciones";
import type { MedioPago, PagoDeVenta } from "../api/consultas";

/** Con qué se paga lo que no es efectivo en un pago mixto. */
export type MedioResto = Exclude<MedioPago, "efectivo">;

/** Opciones del resto, en el orden de la lista (1 y 2 en el teclado). */
export const MEDIOS_RESTO: readonly { valor: MedioResto; etiqueta: string }[] = [
  { valor: "transferencia", etiqueta: "Transferencia" },
  { valor: "tarjeta", etiqueta: "Débito / Crédito" },
];

export interface RevisionPagoMixto {
  /** Parte en efectivo (null si falta o está mal escrita). */
  efectivo: number | null;
  /** Precio final − efectivo: lo que se paga con el otro medio (null si no se puede calcular). */
  resto: number | null;
  /** Por qué todavía no se puede seguir (null si está listo). */
  error: string | null;
}

const centavos = (monto: number) => Math.round(monto * 100);

/**
 * Pago mixto en la caja: el cajero escribe solo la parte en efectivo y el resto (precio final −
 * efectivo) se paga con transferencia o débito/crédito. Es una vista previa: la BD valida el reparto
 * al registrar la venta (`registrar_venta` con `p_pagos`: partes > 0 que suman el precio final).
 * Se resta en centavos enteros para no arrastrar errores de punto flotante.
 */
export function revisarPagoMixto(textoEfectivo: string, precioFinal: number): RevisionPagoMixto {
  if (textoEfectivo.trim() === "") {
    return { efectivo: null, resto: null, error: "Escribí cuánto paga en efectivo." };
  }
  const monto = parsearMonto(textoEfectivo);
  if (monto.valor === undefined) {
    return { efectivo: null, resto: null, error: monto.error };
  }
  const resto = (centavos(precioFinal) - centavos(monto.valor)) / 100;
  if (resto <= 0) {
    return {
      efectivo: monto.valor,
      resto: null,
      error: `El efectivo tiene que ser menor que el precio (${formatearMoneda(precioFinal)}). Si paga todo en efectivo, volvé y elegí Efectivo.`,
    };
  }
  return { efectivo: monto.valor, resto, error: null };
}

/** Las partes que se mandan a la BD: efectivo y el resto con el medio elegido. */
export function pagosMixtos(efectivo: number, resto: number, medio: MedioResto): PagoDeVenta[] {
  return [
    { medio: "efectivo", monto: efectivo },
    { medio, monto: resto },
  ];
}
