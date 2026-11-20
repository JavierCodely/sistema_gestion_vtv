import type { Errores } from "@/compartido/lib/validaciones";
import type { DatosVenta, MedioPago } from "../api/consultas";

/** Mismos límites que los CHECK ventas_patente_largo y turnos_observaciones_largo (migración 014). */
export const LARGO_MAXIMO_PATENTE = 10;
export const LARGO_MAXIMO_OBSERVACIONES = 1000;

/** Igual que registrar_venta: sin espacios y en mayúsculas ("ab 123 cd" → "AB123CD"). */
export function normalizarPatente(texto: string): string {
  return texto.replace(/\s/g, "").toUpperCase();
}

export interface FormularioVenta {
  servicioId: string;
  medioPago: MedioPago | "";
  patente: string;
}

export type ErroresVenta = Errores<"servicioId" | "medioPago" | "patente">;

export function validarVenta(
  formulario: FormularioVenta,
): { errores: ErroresVenta; datos?: undefined } | { errores?: undefined; datos: DatosVenta } {
  const errores: ErroresVenta = {};
  const servicioId = Number(formulario.servicioId);
  const servicioValido = Number.isInteger(servicioId) && servicioId > 0;
  if (!servicioValido) errores.servicioId = "Elegí un servicio.";
  if (!formulario.medioPago) errores.medioPago = "Elegí el medio de pago.";

  const patente = normalizarPatente(formulario.patente);
  if (patente.length > LARGO_MAXIMO_PATENTE) {
    errores.patente = `La patente no puede superar los ${String(LARGO_MAXIMO_PATENTE)} caracteres.`;
  }

  if (!servicioValido || !formulario.medioPago || Object.keys(errores).length > 0) {
    return { errores };
  }
  return {
    datos: { servicioId, medioPago: formulario.medioPago, patente: patente || null },
  };
}

/** Observaciones del cierre: opcionales. */
export function validarObservaciones(texto: string): string | undefined {
  if (texto.trim().length > LARGO_MAXIMO_OBSERVACIONES) {
    return `Las observaciones no pueden superar los ${String(LARGO_MAXIMO_OBSERVACIONES)} caracteres.`;
  }
  return undefined;
}
