import { parsearMonto } from "@/compartido/lib/validaciones";
import { ORDEN_MEDIOS, type MedioPago, type PagoDeVenta } from "../api/consultas";

/** Lo que el cajero escribe en cada medio de un pago mixto ("" = ese medio no se usa). */
export type MontosPagoMixto = Record<MedioPago, string>;

export const MONTOS_VACIOS: MontosPagoMixto = { efectivo: "", transferencia: "", tarjeta: "" };

export interface RevisionPagoMixto {
  /** Partes válidas, en el orden de los medios. */
  partes: PagoDeVenta[];
  /** Error de cada medio mal escrito. */
  errores: Partial<Record<MedioPago, string>>;
  /** Precio final − suma de las partes: > 0 falta, < 0 sobra, 0 cierra. */
  diferencia: number;
  /** Cierra: sin errores, 2 o 3 medios y la suma es el precio final. */
  listo: boolean;
  /** Por qué todavía no se puede confirmar (null si está listo). */
  problema: string | null;
}

const centavos = (monto: number) => Math.round(monto * 100);

/**
 * Vista previa de un pago mixto: cuánto falta o sobra para llegar al precio final y si ya se puede
 * confirmar. Es solo una ayuda de pantalla: la que valida el reparto y lo guarda es la BD
 * (`registrar_venta` con `p_pagos`). Se suma en centavos enteros para no arrastrar errores de punto
 * flotante. Cada parte, con las mismas reglas que `_validar_monto` (`parsearMonto`, > 0).
 */
export function revisarPagoMixto(montos: MontosPagoMixto, precioFinal: number): RevisionPagoMixto {
  const partes: PagoDeVenta[] = [];
  const errores: RevisionPagoMixto["errores"] = {};
  for (const medio of ORDEN_MEDIOS) {
    const texto = montos[medio];
    if (texto.trim() === "") continue;
    const monto = parsearMonto(texto);
    if (monto.valor === undefined) errores[medio] = monto.error;
    else partes.push({ medio, monto: monto.valor });
  }
  const suma = partes.reduce((total, parte) => total + centavos(parte.monto), 0);
  const diferencia = (centavos(precioFinal) - suma) / 100;

  let problema: string | null = null;
  if (Object.keys(errores).length > 0) problema = "Corregí los montos marcados.";
  else if (partes.length < 2) problema = "Cargá el monto de al menos dos medios de pago.";
  else if (diferencia !== 0) {
    problema = diferencia > 0 ? "Los montos no llegan al precio." : "Los montos superan el precio.";
  }
  return { partes, errores, diferencia, listo: problema === null, problema };
}
