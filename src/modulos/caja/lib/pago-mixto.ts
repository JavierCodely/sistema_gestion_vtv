import { formatearMoneda } from "@/compartido/lib/formato";
import { parsearMonto } from "@/compartido/lib/validaciones";
import type { PagoDeVenta } from "../api/consultas";

export interface RevisionPagoMixto {
  /** Parte en efectivo (null si falta o está mal escrita). */
  efectivo: number | null;
  /** Precio final − efectivo: lo que se paga por transferencia (null si no se puede calcular). */
  resto: number | null;
  /** Por qué todavía no se puede seguir (null si está listo). */
  error: string | null;
}

const centavos = (monto: number) => Math.round(monto * 100);

/**
 * Pago mixto en la caja: el cajero escribe solo la parte en efectivo y el resto (precio final −
 * efectivo) se paga por transferencia (migración 54: no hay tarjeta). Es una vista previa: la BD valida el reparto
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

/** Las partes que se mandan a la BD: efectivo y el resto por transferencia. */
export function pagosMixtos(efectivo: number, resto: number): PagoDeVenta[] {
  return [
    { medio: "efectivo", monto: efectivo },
    { medio: "transferencia", monto: resto },
  ];
}
